import type { NextFunction, Request, Response } from 'express'
import { Role } from '@prisma/client'
import { ApiError } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'

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

/**
 * May open settings, the danger zone and the restart button. One person, and
 * not "an admin" — an admin allocates delegates and approves registrations,
 * which several people on the secretariat do; wiping the conference is not.
 *
 * Reads `User.isOwner` rather than comparing the username against a literal.
 * A hardcoded name would have to be right on every database this code ever
 * meets: the handover to next year's secretariat renames the account, a
 * restored dump can carry a different one, and the test database has no such
 * user at all — each of which is a code change and a deploy to fix, on the one
 * screen you cannot get to in order to fix it. The flag is a row, so moving
 * ownership is an UPDATE and granting it to a second person is a checkbox.
 *
 * Checked against the database on every request rather than read from the JWT,
 * for the same reason canManageUsers is: revoking it has to take effect now,
 * not when a fifteen-minute access token happens to expire.
 */
export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user
  if (!user) {
    next(ApiError.unauthorized())
    return
  }

  prisma.user
    .findUnique({ where: { id: user.id }, select: { isOwner: true } })
    .then((row) => {
      if (!row?.isOwner) {
        next(
          ApiError.forbidden(
            'Settings and the danger zone belong to the hub owner. Ask whoever set up this deployment.',
          ),
        )
        return
      }
      next()
    })
    .catch(next)
}
