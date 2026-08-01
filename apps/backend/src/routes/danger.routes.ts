import { Router } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest } from '../lib/audit.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { requireAdmin } from '../middleware/rbac.js'
import { env } from '../config/env.js'

/**
 * Irreversible bulk operations.
 *
 * Everything here is ADMIN-only and additionally gated on a passphrase, because
 * an access token is something a signed-in browser already has: a mis-click on
 * a shared registration-desk laptop should not be able to empty the conference.
 * The passphrase is the deliberate second act, not a second identity.
 */
export const dangerRouter = Router()

dangerRouter.use(requireAdmin)

/**
 * Empty means the feature is off, not that any passphrase will do — a
 * deployment that never sets it cannot have its conference erased at all.
 *
 * NOT hardcoded on purpose. The repository is public, and a reset passphrase in
 * the source is a published key to erasing the conference.
 */
function configuredPassphrase(): string | null {
  return env.DANGER_RESET_PASSPHRASE.length > 0 ? env.DANGER_RESET_PASSPHRASE : null
}

/** Constant-time, so a wrong guess cannot be narrowed by how long it took. */
function passphraseMatches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // length oracle. Compare padded copies and fold the real length in.
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

/**
 * Tables emptied by a reset, in the order they must go.
 *
 * Accounts are never touched — clearing the conference must not lock the
 * secretariat out of the hub that runs it. Neither is the audit log: it is the
 * record that this happened, and a wipe that erases its own evidence is not a
 * record. Settings survive too; the registration form link is configuration,
 * not conference data.
 *
 * Order is by foreign key, children first. Several of these would cascade
 * anyway, but relying on cascade order leaves the sequence undocumented and one
 * schema change away from a constraint violation at the worst possible moment.
 */
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

    // Counted before, so the response can report what was actually destroyed
    // rather than what the caller assumed was there.
    const before = {
      awards: await prisma.award.count(),
      assignments: await prisma.assignment.count(),
      registrations: await prisma.registration.count(),
      logisticsRequests: await prisma.logisticsReq.count(),
      delegates: await prisma.delegate.count(),
      committees: await prisma.committee.count(),
    }

    // One transaction: a reset that half-succeeds leaves delegates pointing at
    // committees that no longer exist, which is worse than either outcome.
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

/**
 * What a reset would remove, so the confirmation can state it rather than
 * asking someone to trust a generic warning.
 */
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
