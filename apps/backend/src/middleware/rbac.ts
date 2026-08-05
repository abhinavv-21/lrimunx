import type { NextFunction, Request, Response } from 'express'
import { Role } from '@prisma/client'
import { ApiError } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'

/**
 * Role gate. Must sit after requireAuth.
 *
 * The CONTRIBUTOR boundary defined in CLAUDE.md and the agent briefs:
 *   - read-only on delegate lists
 *   - create-only on /logistics-requests
 *   - attendance check-in submission
 * Everything else is ADMIN.
 */
export function requireRole(...allowed: Role[]) {
  return function roleGate(req: Request, _res: Response, next: NextFunction): void {
    const user = req.user
    if (!user) {
      next(ApiError.unauthorized())
      return
    }
    if (!allowed.includes(user.role)) {
      next(ApiError.forbidden(`This action requires the ${allowed.join(' or ')} role`))
      return
    }
    next()
  }
}

export const requireAdmin = requireRole(Role.ADMIN)
export const requireAnyRole = requireRole(Role.ADMIN, Role.CONTRIBUTOR)

/**
 * Account administration, which is narrower than ADMIN.
 *
 * Running the conference and deciding who can sign in are different powers, and
 * most admins need only the first. This gate is what enforces that; hiding the
 * Users tab in the hub is presentation and stops nobody who can type a URL.
 *
 * Read from the DATABASE on every request rather than from the access token.
 * The token lives fifteen minutes, so a flag baked into it would keep working
 * for fifteen minutes after being revoked — and revocation is the whole reason
 * this exists. One extra query, on the handful of routes that manage accounts.
 */
export function requireUserManager(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const user = req.user
  if (!user) {
    next(ApiError.unauthorized())
    return
  }

  prisma.user
    .findUnique({ where: { id: user.id }, select: { canManageUsers: true } })
    .then((row) => {
      if (!row?.canManageUsers) {
        next(
          ApiError.forbidden(
            'Managing accounts is restricted to specific users. Ask whoever set up the hub.',
          ),
        )
        return
      }
      next()
    })
    .catch(next)
}
