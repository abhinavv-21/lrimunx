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
