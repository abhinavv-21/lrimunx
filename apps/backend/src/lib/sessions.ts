import { createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { prisma } from './prisma.js'
import { ApiError } from './errors.js'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function expiryOf(token: string): Date {
  const decoded = jwt.decode(token)
  const exp = decoded && typeof decoded === 'object' ? (decoded as { exp?: number }).exp : undefined
  if (typeof exp !== 'number') {
    throw new Error('Refresh token carries no expiry — refusing to record a session that never ends.')
  }
  return new Date(exp * 1000)
}

export async function recordSession(userId: string, refreshToken: string): Promise<void> {
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(refreshToken), expiresAt: expiryOf(refreshToken) },
  })
}

export async function requireLiveSession(refreshToken: string): Promise<{ id: string }> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    select: { id: true, revokedAt: true, expiresAt: true },
  })

  const dead =
    !session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()
  if (dead) throw ApiError.unauthorized('That session has ended. Sign in again.')

  await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
  return { id: session.id }
}

export async function revokeSession(refreshToken: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const { count } = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return count
}

export async function rotateSession(
  sessionId: string,
  userId: string,
  nextToken: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }),
    prisma.session.create({
      data: { userId, tokenHash: hashToken(nextToken), expiresAt: expiryOf(nextToken) },
    }),
  ])
}

export async function sweepExpiredSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000)
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: cutoff } } })
  return count
}
