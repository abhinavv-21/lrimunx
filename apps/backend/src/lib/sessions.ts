/**
 * sessions.ts — the guest list for refresh tokens.
 *
 * WHY THIS EXISTS
 * A refresh token used to be checked the way a bouncer checks a wristband with
 * no guest list: the signature was valid and the date had not passed, so in you
 * went. The server kept no record of what it had issued, which meant it had no
 * way to refuse one later. Signing out cleared the browser and nothing else, so
 * a token copied from a shared school machine kept minting access tokens until
 * it expired on its own — and neither signing out nor changing the password
 * made any difference.
 *
 * Every refresh token now has a row here. Signing out marks it revoked, and a
 * revoked or unknown token is refused.
 *
 * WHAT IS STORED
 * Not the token. A SHA-256 of it, which is enough to recognise the one that
 * arrives on a request and useless to anybody who reads the table. SHA-256
 * rather than bcrypt on purpose: this runs on every refresh and the input is a
 * signed JWT with far more entropy than a password, so the slow hash buys
 * nothing and would cost a lookup — bcrypt cannot be queried by equality.
 */
import { createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { prisma } from './prisma.js'
import { ApiError } from './errors.js'

/** The lookup key for a refresh token. Never reversible into the token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * When this token stops being valid, taken from the token's own `exp`.
 *
 * Read from the token rather than recomputed from JWT_REFRESH_TTL so the row
 * and the token can never disagree — if the TTL is changed while tokens issued
 * under the old one are still live, a recomputed expiry would be wrong for
 * exactly those.
 */
function expiryOf(token: string): Date {
  const decoded = jwt.decode(token)
  const exp = decoded && typeof decoded === 'object' ? (decoded as { exp?: number }).exp : undefined
  if (typeof exp !== 'number') {
    // Only reachable if signRefreshToken stops setting expiresIn.
    throw new Error('Refresh token carries no expiry — refusing to record a session that never ends.')
  }
  return new Date(exp * 1000)
}

/** Record a newly issued refresh token as a live session. */
export async function recordSession(userId: string, refreshToken: string): Promise<void> {
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(refreshToken), expiresAt: expiryOf(refreshToken) },
  })
}

/**
 * Check a refresh token against the guest list and stamp it as used.
 *
 * The signature has already been verified by the caller; this answers the
 * question the signature cannot — whether this particular token is still one
 * the server is willing to honour.
 */
export async function requireLiveSession(refreshToken: string): Promise<{ id: string }> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    select: { id: true, revokedAt: true, expiresAt: true },
  })

  /*
    One message for all three failures — unknown, revoked and expired.

    They are the same event to the person holding the token: sign in again. And
    distinguishing them tells anyone probing with a stolen token which of those
    it is, which is the one audience that benefits from knowing.
  */
  const dead =
    !session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()
  if (dead) throw ApiError.unauthorized('That session has ended. Sign in again.')

  await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
  return { id: session.id }
}

/**
 * End one session, by its token.
 *
 * Idempotent, and silent about a token it does not recognise: signing out is
 * not a place to tell the caller whether a token was real.
 */
export async function revokeSession(refreshToken: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** End every live session for one account. Returns how many were ended. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const { count } = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return count
}

/**
 * Rotate: the presented token is spent and a fresh one takes its place.
 *
 * This is what limits the damage of a copied token. Once the real operator's
 * client refreshes — which it does every fifteen minutes — the copy is revoked
 * and stops working, without anybody having noticed anything.
 *
 * Deliberately NOT reuse-detection: presenting an already-rotated token revokes
 * nothing beyond itself. The textbook response is to kill every session that
 * user has, but two browser tabs refreshing in the same second produce exactly
 * that pattern, and signing an OC member out mid-shift at a check-in desk is a
 * real cost against a speculative one.
 */
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

/**
 * Delete rows whose tokens expired more than a day ago.
 *
 * Revoked rows are kept until their natural expiry: while a token could still
 * be presented, the row is the only thing that knows to refuse it. Deleting it
 * early would turn a revoked session back into an unknown one — which is also
 * refused, so this is tidiness rather than correctness, but the distinction
 * matters if reuse-detection is ever added.
 */
export async function sweepExpiredSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000)
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: cutoff } } })
  return count
}
