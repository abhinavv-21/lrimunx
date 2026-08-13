import { Router } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest } from '../lib/audit.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { requireAdmin } from '../middleware/rbac.js'
import { env } from '../config/env.js'

export const dangerRouter = Router()

dangerRouter.use(requireAdmin)

function configuredPassphrase(): string | null {
  return env.DANGER_RESET_PASSPHRASE.length > 0 ? env.DANGER_RESET_PASSPHRASE : null
}

function passphraseMatches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)

  const length = Math.max(a.length, b.length)
  const padA = Buffer.alloc(length)
  const padB = Buffer.alloc(length)
  a.copy(padA)
  b.copy(padB)
  return timingSafeEqual(padA, padB) && a.length === b.length
}

const resetSchema = z.object({
  passphrase: z.string().min(1, 'The passphrase is required').max(200),
})

const RESET_ORDER = [
  'awards',
  'assignments',
  'registrations',
  'logisticsRequests',
  'delegates',
  'committees',
] as const

export interface ResetResult {
  deleted: Record<(typeof RESET_ORDER)[number], number>
  total: number
}

dangerRouter.post(
  '/reset',
  validate(resetSchema),
  asyncHandler(async (req, res) => {
    const { passphrase } = req.body as { passphrase: string }

    const expected = configuredPassphrase()
    if (!expected) {
      throw new ApiError(
        503,
        'Bulk reset is not configured on this deployment. Set DANGER_RESET_PASSPHRASE to enable it.',
      )
    }

    if (!passphraseMatches(passphrase, expected)) {
      throw new ApiError(403, 'That passphrase is not correct. Nothing was deleted.')
    }

    const before = {
      awards: await prisma.award.count(),
      assignments: await prisma.assignment.count(),
      registrations: await prisma.registration.count(),
      logisticsRequests: await prisma.logisticsReq.count(),
      delegates: await prisma.delegate.count(),
      committees: await prisma.committee.count(),
    }

    await prisma.$transaction([
      prisma.award.deleteMany(),
      prisma.assignment.deleteMany(),
      prisma.registration.deleteMany(),
      prisma.logisticsReq.deleteMany(),
      prisma.delegate.deleteMany(),
      prisma.committee.deleteMany(),
    ])

    const total = Object.values(before).reduce((sum, n) => sum + n, 0)

    await auditRequest(req, {
      action: 'RESET',
      entityType: 'Conference',
      entityId: 'all',
      payloadBefore: before,
      payloadAfter: { deleted: total },
    })

    const result: ResetResult = { deleted: before, total }
    res.json(result)
  }),
)

dangerRouter.get(
  '/reset/preview',
  asyncHandler(async (_req, res) => {
    const [awards, assignments, registrations, logisticsRequests, delegates, committees] =
      await Promise.all([
        prisma.award.count(),
        prisma.assignment.count(),
        prisma.registration.count(),
        prisma.logisticsReq.count(),
        prisma.delegate.count(),
        prisma.committee.count(),
      ])

    const deleted = { awards, assignments, registrations, logisticsRequests, delegates, committees }
    res.json({
      deleted,
      total: Object.values(deleted).reduce((sum, n) => sum + n, 0),
      configured: configuredPassphrase() !== null,
    })
  }),
)
