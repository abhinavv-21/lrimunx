import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { recordAudit } from '../lib/audit.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import { auditQuery } from '../schemas/index.js'

export const auditRouter = Router()

// The audit trail is ADMIN-only. Individual rows are never updated or deleted;
// the only write is the bulk clear below, which leaves its own record behind.
auditRouter.use(requireAdmin)

type AuditQuery = {
  page: number
  pageSize: number
  search?: string
  entityType?: string
  entityId?: string
  userId?: string
  action?: string
}

auditRouter.get(
  '/',
  validate(auditQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as AuditQuery

    const where: Prisma.AuditLogWhereInput = {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.search
        ? {
            OR: [
              { entityType: { contains: q.search, mode: 'insensitive' } },
              { action: { contains: q.search, mode: 'insensitive' } },
              { user: { fullName: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { id: true, fullName: true, username: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ])

    res.json({ items, total, page: q.page, pageSize: q.pageSize })
  }),
)

/**
 * Clears the activity history.
 *
 * A trail that can be erased without trace is not a trail, so the clear itself
 * is recorded: the log ends up holding exactly one entry stating who cleared
 * it, when, and how many entries were removed.
 */
auditRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    const actor = currentUser(req)

    const { count } = await prisma.auditLog.deleteMany({})

    await recordAudit({
      userId: actor.id,
      action: 'CLEAR',
      entityType: 'AuditLog',
      entityId: 'all',
      payloadBefore: { entriesRemoved: count },
    })
    req.auditWritten = true

    res.json({ deleted: count })
  }),
)

/** Full history for one record — used by the "activity" panel on detail views. */
auditRouter.get(
  '/entity/:entityType/:entityId',
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.params as { entityType: string; entityId: string }

    const items = await prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { timestamp: 'desc' },
      take: 100,
      include: { user: { select: { id: true, fullName: true, role: true } } },
    })

    res.json({ items, total: items.length })
  }),
)
