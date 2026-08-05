import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser, requireAuth, signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth.js'
import {
  recordSession,
  requireLiveSession,
  revokeAllSessions,
  revokeSession,
  rotateSession,
} from '../lib/sessions.js'
import { loginSchema, refreshSchema } from '../schemas/index.js'

export const authRouter = Router()

// Credential stuffing defence. Deliberately tighter than the global API limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many failed sign-in attempts. Try again in 15 minutes.', code: 429 },
})

authRouter.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as { username: string; password: string }

    const user = await prisma.user.findUnique({ where: { username } })

    // Compare against a dummy hash when the user is absent so that response
    // timing does not reveal whether the username exists.
    const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu'
    const passwordMatches = await bcrypt.compare(password, hash)

    if (!user || !passwordMatches) {
      throw ApiError.unauthorized('Incorrect username or password')
    }

    const authUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      canManageUsers: user.canManageUsers,
    }

    // Recorded before it is handed over: a token the client holds but the
    // server has no row for is one that cannot be revoked.
    const refreshToken = signRefreshToken(user.id)
    await recordSession(user.id, refreshToken)

    res.json({
      accessToken: signAccessToken(authUser),
      refreshToken,
      user: authUser,
    })
  }),
)

/**
 * POST /api/v1/auth/refresh
 *
 * Two checks, not one. The signature says the token was issued by this server
 * and has not expired; the session says the server is still willing to honour
 * it. Only the second can answer "that one was signed out an hour ago".
 *
 * The presented token is spent in the process — see rotateSession.
 */
authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as { refreshToken: string }
    const payload = verifyRefreshToken(refreshToken)
    const session = await requireLiveSession(refreshToken)

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) throw ApiError.unauthorized('Account no longer exists')

    const authUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      canManageUsers: user.canManageUsers,
    }

    const nextRefreshToken = signRefreshToken(user.id)
    await rotateSession(session.id, user.id, nextRefreshToken)

    res.json({
      accessToken: signAccessToken(authUser),
      refreshToken: nextRefreshToken,
      user: authUser,
    })
  }),
)

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = currentUser(req)
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        canManageUsers: true,
        createdAt: true,
      },
    })
    if (!user) throw ApiError.unauthorized('Account no longer exists')
    res.json(user)
  }),
)

/**
 * POST /api/v1/auth/logout
 *
 * Ends the session server-side, so the refresh token stops working for whoever
 * is holding it — which is the whole point. Before there was a Session table
 * this could only ask the client to forget its tokens, and a copy taken from a
 * shared machine simply carried on.
 *
 * The access token expires on its own within the quarter hour; the refresh
 * token is the one with reach, so it is the one revoked.
 *
 * Send `refreshToken` to end THIS sign-in. With no token the server cannot tell
 * which of that account's sessions is being left, and the safe reading of
 * "sign me out" is all of them — so that is what it does, rather than leaving a
 * live session behind on the assumption the caller meant something narrower.
 */
authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = currentUser(req)
    const supplied = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken

    if (typeof supplied === 'string' && supplied.trim() !== '') {
      await revokeSession(supplied)
    } else {
      await revokeAllSessions(id)
    }

    res.status(204).send()
  }),
)
