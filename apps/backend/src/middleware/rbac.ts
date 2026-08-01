import type { NextFunction, Request, Response } from 'express'
import { Role } from '@prisma/client'
import { ApiError } from '../lib/errors.js'

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
