import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser, requireAuth, signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth.js'
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

    const authUser = { id: user.id, username: user.username, fullName: user.fullName, role: user.role }

    res.json({
      accessToken: signAccessToken(authUser),
      refreshToken: signRefreshToken(user.id),
      user: authUser,
    })
  }),
)

authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as { refreshToken: string }
    const payload = verifyRefreshToken(refreshToken)

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) throw ApiError.unauthorized('Account no longer exists')

    const authUser = { id: user.id, username: user.username, fullName: user.fullName, role: user.role }

    res.json({
      accessToken: signAccessToken(authUser),
      refreshToken: signRefreshToken(user.id),
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
      select: { id: true, username: true, fullName: true, role: true, createdAt: true },
    })
    if (!user) throw ApiError.unauthorized('Account no longer exists')
    res.json(user)
  }),
)

/**
 * Access tokens are short-lived and stateless, so there is no server-side
 * session to destroy. This endpoint exists so the client has a single place to
 * signal sign-out; the client is responsible for discarding both tokens.
 */
authRouter.post('/logout', requireAuth, (_req, res) => {
  res.status(204).send()
})
