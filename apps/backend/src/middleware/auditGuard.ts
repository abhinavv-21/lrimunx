import type { NextFunction, Request, Response } from 'express'
import { Role } from '@prisma/client'
import { isProduction } from '../config/env.js'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Development safety net for CLAUDE.md rule 2: every successful ADMIN mutation
 * must leave an AuditLog row. Routes call auditRequest(), which sets
 * req.auditWritten; this warns loudly when one forgets.
 *
 * It deliberately only warns. Failing the response after the write has already
 * committed would be worse than a missing log line, and in production the gap
 * should be caught by the QA suite rather than at runtime.
 */
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
