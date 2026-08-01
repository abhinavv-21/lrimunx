import type { Prisma } from '@prisma/client'
import type { Request } from 'express'
import { prisma } from './prisma.js'
import type { PrismaTransaction } from './prisma.js'

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'CHECK_IN' | 'IMPORT' | 'EXPORT' | 'RESOLVE'

export interface AuditParams {
  userId: string
  action: AuditAction | string
  entityType: string
  entityId: string
  payloadBefore?: unknown
  payloadAfter?: unknown
}

/**
 * Fields that must never be persisted into the audit trail.
 * Audit rows are readable by every ADMIN, so secrets stay out of them.
 */
const REDACTED_KEYS = new Set(['passwordHash', 'password', 'token', 'refreshToken', 'keysAuth', 'keysP256'])

function sanitise(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object') return value as Prisma.InputJsonValue

  if (Array.isArray(value)) {
    return value.map((item) => sanitise(item) ?? null) as Prisma.InputJsonValue
  }

  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key)) {
      output[key] = '[redacted]'
      continue
    }
    if (entry instanceof Date) {
      output[key] = entry.toISOString()
      continue
    }
    output[key] = entry === null ? null : sanitise(entry) ?? null
  }
  return output as Prisma.InputJsonValue
}

/**
 * Writes one AuditLog row. Pass the transaction client when the audit must
 * commit atomically with the mutation it describes — assignments and any
 * other multi-step write should always do this.
 */
export async function recordAudit(
  params: AuditParams,
  client: PrismaTransaction | typeof prisma = prisma,
): Promise<void> {
  const before = sanitise(params.payloadBefore)
  const after = sanitise(params.payloadAfter)

  await client.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      ...(before !== undefined ? { payloadBefore: before } : {}),
      ...(after !== undefined ? { payloadAfter: after } : {}),
    },
  })
}

/**
 * Convenience wrapper for route handlers: records the audit entry and marks
 * the request so the audit guard knows the mutation was covered.
 */
export async function auditRequest(
  req: Request,
  params: Omit<AuditParams, 'userId'>,
  client: PrismaTransaction | typeof prisma = prisma,
): Promise<void> {
  if (!req.user) return
  await recordAudit({ ...params, userId: req.user.id }, client)
  req.auditWritten = true
}
