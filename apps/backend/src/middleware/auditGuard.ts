import type { NextFunction, Request, Response } from 'express'
import { Role } from '@prisma/client'
import { isProduction } from '../config/env.js'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function auditGuard(req: Request, res: Response, next: NextFunction): void {
  if (isProduction || !MUTATING_METHODS.has(req.method)) {
    next()
    return
  }

  res.on('finish', () => {
    const succeeded = res.statusCode >= 200 && res.statusCode < 300
    if (succeeded && req.user?.role === Role.ADMIN && !req.auditWritten) {
      console.warn(
        `[audit] ${req.method} ${req.originalUrl} succeeded as ADMIN without writing an AuditLog entry.`,
      )
    }
  })

  next()
}
