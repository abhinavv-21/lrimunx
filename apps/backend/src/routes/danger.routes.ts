import { Router } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import type { PrismaTransaction } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest } from '../lib/audit.js'
import { readTierPrices } from '../lib/conference.js'
import { seedPlaceholders, type PlaceholderCounts } from '../lib/placeholders.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireOwner } from '../middleware/rbac.js'
import { CONFIRMATION_PHRASE, confirmationSchema } from '../schemas/index.js'
import { env } from '../config/env.js'

export const dangerRouter = Router()

// Not requireAdmin. Several people on the secretariat are admins because
// allocating delegates and approving registrations is the job; wiping the
// conference is not, and it is the one action with no undo.
dangerRouter.use(requireOwner)

function resetEnabled(): boolean {
  return env.DANGER_RESET_PASSPHRASE.length > 0
}

/**
 * Two separate questions, and they used to be answered by the same secret.
 *
 * DANGER_RESET_PASSPHRASE decides whether this deployment offers the button at
 * all — a server-side switch, set once, that keeps the reset off a demo box.
 * CONFIRMATION_PHRASE is what the person clicking types to say they meant it,
 * and it is deliberately a known word rather than a secret: the box is there to
 * interrupt, not to authenticate. Whoever got this far is already the owner.
 *
 * Conflating the two meant the confirmation box was a password prompt whose
 * password had to be passed around in chat, which is how a secret stops being
 * one.
 */
function confirmationMatches(supplied: string): boolean {
  const a = Buffer.from(supplied)
  const b = Buffer.from(CONFIRMATION_PHRASE)

  const length = Math.max(a.length, b.length)
  const padA = Buffer.alloc(length)
  const padB = Buffer.alloc(length)
  a.copy(padA)
  b.copy(padB)
  return timingSafeEqual(padA, padB) && a.length === b.length
}

function requireArmedConfirmation(supplied: string): void {
  if (!resetEnabled()) {
    throw new ApiError(
      503,
      'Bulk reset is not configured on this deployment. Set DANGER_RESET_PASSPHRASE to enable it.',
    )
  }

  if (!confirmationMatches(supplied)) {
    throw new ApiError(
      403,
      `That confirmation phrase is not correct. Type ${CONFIRMATION_PHRASE} exactly. Nothing was deleted.`,
    )
  }
}

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

// Attendance is not counted separately here. DelegateAttendance cascades from
// Delegate, so it goes with the delegates it belongs to and a second number for
// the same deletion would only invite someone to add the two together.
const deleteConferenceData = (tx: PrismaTransaction) => [
  tx.award.deleteMany(),
  tx.assignment.deleteMany(),
  tx.registration.deleteMany(),
  tx.logisticsReq.deleteMany(),
  tx.delegate.deleteMany(),
]

dangerRouter.post(
  '/reset',
  validate(confirmationSchema),
  asyncHandler(async (req, res) => {
    const { passphrase } = req.body as { passphrase: string }
    requireArmedConfirmation(passphrase)

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

export interface RestartResult {
  deleted: Record<Exclude<(typeof RESET_ORDER)[number], 'committees'>, number>
  seeded: PlaceholderCounts
}

/**
 * Wipe, then put a rehearsal conference back.
 *
 * Same delete order as /reset with one deliberate exception: committees stay.
 * A restart exists so someone can practise on a hub with people in it, and the
 * rooms and their country matrices are what they are practising against — they
 * are the conference's structure, not its data. Deleting them would also leave
 * the seeder with nowhere to seat anybody, and the only way to get them back is
 * the deploy script, which is not something to need in the middle of a
 * rehearsal. Use /reset when the committees themselves are what is wrong.
 */
dangerRouter.post(
  '/restart-conference',
  validate(confirmationSchema),
  asyncHandler(async (req, res) => {
    const { passphrase } = req.body as { passphrase: string }
    requireArmedConfirmation(passphrase)

    const actor = currentUser(req)

    const committees = await prisma.committee.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        totalSeats: true,
        countries: { select: { country: true }, orderBy: { country: 'asc' } },
      },
    })

    if (committees.length === 0) {
      throw ApiError.unprocessable(
        'There are no committees to seat anyone in. Run the deploy bootstrap to create them, then restart the conference.',
      )
    }

    const prices = await readTierPrices()

    const before = {
      awards: await prisma.award.count(),
      assignments: await prisma.assignment.count(),
      registrations: await prisma.registration.count(),
      logisticsRequests: await prisma.logisticsReq.count(),
      delegates: await prisma.delegate.count(),
    }

    // One transaction, so a failure halfway through the seed cannot leave the
    // hub emptied and not refilled. The default isolation level is enough here:
    // there is no state transition to protect, and the whole thing is a delete
    // followed by inserts into tables it just emptied.
    const seeded = await prisma.$transaction(
      async (tx) => {
        for (const statement of deleteConferenceData(tx)) await statement

        return seedPlaceholders(
          tx,
          committees.map((c) => ({
            id: c.id,
            code: c.code,
            totalSeats: c.totalSeats,
            countries: c.countries.map((row) => row.country),
          })),
          actor.id,
          prices,
        )
      },
      { timeout: 30_000 },
    )

    await auditRequest(req, {
      action: 'RESTART',
      entityType: 'Conference',
      entityId: 'all',
      payloadBefore: before,
      payloadAfter: seeded,
    })

    const result: RestartResult = { deleted: before, seeded }
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
      configured: resetEnabled(),
      confirmationPhrase: CONFIRMATION_PHRASE,
    })
  }),
)
