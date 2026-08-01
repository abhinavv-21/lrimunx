import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { Role } from '@prisma/client'
import { env } from '../config/env.js'
import { ApiError } from '../lib/errors.js'
import type { AuthUser } from '../types/express.js'

export interface AccessTokenPayload {
  sub: string
  username: string
  fullName: string
  role: Role
}

export interface RefreshTokenPayload {
  sub: string
  tokenType: 'refresh'
}

export function signAccessToken(user: AuthUser): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  }
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_TTL } as jwt.SignOptions)
}

export function signRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, tokenType: 'refresh' }
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL } as jwt.SignOptions)
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload
    if (decoded.tokenType !== 'refresh') throw ApiError.unauthorized('Invalid refresh token')
    return decoded
  } catch {
    throw ApiError.unauthorized('Refresh token is invalid or expired')
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

/**
 * Rejects the request unless it carries a valid access token.
 * Every route under /api/v1 except /auth/login, /auth/refresh and /health
 * sits behind this.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearer(req)
  if (!token) {
    next(ApiError.unauthorized('Missing bearer token'))
    return
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload
    req.user = {
      id: decoded.sub,
      username: decoded.username,
      fullName: decoded.fullName,
      role: decoded.role,
    }
    next()
  } catch (error) {
    const message = error instanceof jwt.TokenExpiredError
      ? 'Access token expired'
      : 'Access token is invalid'
    next(ApiError.unauthorized(message))
  }
}

/** Narrowing helper for route handlers that run behind requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized()
  return req.user
}
