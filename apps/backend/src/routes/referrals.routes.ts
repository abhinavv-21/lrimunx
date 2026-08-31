import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest } from '../lib/audit.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { requireAdmin } from '../middleware/rbac.js'
import { uuidParam } from '../schemas/index.js'
import {
  REFERRAL_PAYOUT_QUOTA,
  REFERRAL_RATE_HOUSE,
  REFERRAL_RATE_OUTSIDE,
  checkReferralCode,
  normaliseReferralCode,
  tallyReferrals,
} from '../lib/referrals.js'

export const referralsRouter = Router()

/**
 * Referral codes and what each one has earned.
 *
 * Admin only. The numbers here decide a payout, and an accurate count of who
 * brought whom is also a list of which delegate belongs to which recruiter,
 * which is not something a contributor needs in order to run a room.
 */
referralsRouter.use(requireAdmin)

const createSchema = z.object({
  // Deliberately loose here and strict in checkReferralCode, so the refusal
  // carries the sentence explaining what is wrong rather than a Zod message
  // about a regular expression.
  code: z.string().min(1).max(64),
  ownerName: z.string().trim().min(2).max(120),
  note: z.string().trim().max(500).optional().nullable(),
})

const updateSchema = z.object({
  ownerName: z.string().trim().min(2).max(120).optional(),
  note: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().optional(),
})

/** The registration fields the tally needs, and the hub shows. */
const usedBy = {
  id: true,
  reference: true,
  fullName: true,
  schoolName: true,
  status: true,
  priceTier: true,
  amountPaid: true,
  referralCode: true,
  createdAt: true,
} as const

async function listWithEarnings() {
  const codes = await prisma.referralCode.findMany({
    orderBy: [{ active: 'desc' }, { ownerName: 'asc' }],
    include: { registrations: { select: usedBy, orderBy: { createdAt: 'desc' } } },
  })

  return codes.map(({ registrations, ...code }) => ({
    ...code,
    tally: tallyReferrals(registrations),
    registrations,
  }))
}

referralsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await listWithEarnings()

    /**
     * Typed answers that matched no code.
     *
     * Worth surfacing rather than discarding: every row here is somebody who
     * believed they were crediting a friend and was not. Usually it is a code
     * that has not been created yet, occasionally it is a typo, and either way
     * somebody should look. Grouped by the normalised key, so twelve spellings
     * of one missing code are one line.
     */
    const unmatched = await prisma.registration.findMany({
      where: { referralCodeId: null, NOT: { referralCode: null } },
      select: { reference: true, fullName: true, referralCode: true, status: true },
      orderBy: { createdAt: 'desc' },
    })

    const orphans = new Map<string, { key: string; typed: string[]; count: number }>()
    for (const row of unmatched) {
      const key = normaliseReferralCode(row.referralCode)
      if (key === null) continue
      const entry = orphans.get(key) ?? { key, typed: [], count: 0 }
      entry.count += 1
      if (row.referralCode && !entry.typed.includes(row.referralCode)) {
        entry.typed.push(row.referralCode)
      }
      orphans.set(key, entry)
    }

    res.json({
      items,
      unmatched: [...orphans.values()].sort((a, b) => b.count - a.count),
      rates: {
        outside: REFERRAL_RATE_OUTSIDE,
        house: REFERRAL_RATE_HOUSE,
        quota: REFERRAL_PAYOUT_QUOTA,
      },
    })
  }),
)

referralsRouter.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createSchema>

    const check = checkReferralCode(input.code)
    if (!check.ok) throw ApiError.badRequest(check.reason ?? 'That is not a usable referral code.')

    // On the key, not the display form: RIDGE-MUNSOC and RIDGEMUNSOC are one
    // code, and letting both exist would split a referrer's count in two.
    const clash = await prisma.referralCode.findUnique({
      where: { matchKey: check.key },
      select: { code: true, ownerName: true },
    })
    if (clash) {
      throw ApiError.conflict(
        `${check.code} is the same code as ${clash.code}, which belongs to ${clash.ownerName}. ` +
          'Two people cannot share a code, and spaces and hyphens do not make it a different one.',
      )
    }

    const created = await prisma.referralCode.create({
      data: {
        code: check.code,
        matchKey: check.key,
        ownerName: input.ownerName,
        note: input.note ?? null,
      },
    })

    /**
     * Adopt the registrations that already typed this code.
     *
     * A code is usually created before it is handed out, but not always: the
     * secretariat hears "someone told me to put ABHINAV21" and creates it
     * afterwards. Without this, everyone who applied in between is credited to
     * nobody, and the referrer is short of the quota through no fault of theirs.
     *
     * Matching is done in JavaScript rather than SQL because the stored text is
     * whatever was typed, and the comparison is against its normalised form —
     * which no amount of ILIKE reproduces.
     */
    const candidates = await prisma.registration.findMany({
      where: { referralCodeId: null, NOT: { referralCode: null } },
      select: { id: true, referralCode: true },
    })
    const adoptable = candidates
      .filter((row) => normaliseReferralCode(row.referralCode) === check.key)
      .map((row) => row.id)

    if (adoptable.length > 0) {
      await prisma.registration.updateMany({
        where: { id: { in: adoptable } },
        data: { referralCodeId: created.id },
      })
    }

    await auditRequest(req, {
      action: 'referral.create',
      entityType: 'ReferralCode',
      entityId: created.id,
      payloadAfter: { ...created, adopted: adoptable.length },
    })

    res.status(201).json({ item: created, adopted: adoptable.length })
  }),
)

referralsRouter.patch(
  '/:id',
  validate(uuidParam, 'params'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const input = req.body as z.infer<typeof updateSchema>

    const before = await prisma.referralCode.findUnique({ where: { id } })
    if (!before) throw ApiError.notFound('Referral code not found')

    // The code itself is deliberately not editable. Changing it would silently
    // move every registration attached to it onto a key they never typed.
    const after = await prisma.referralCode.update({
      where: { id },
      data: {
        ...(input.ownerName === undefined ? {} : { ownerName: input.ownerName }),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.active === undefined ? {} : { active: input.active }),
      },
    })

    await auditRequest(req, {
      action: 'referral.update',
      entityType: 'ReferralCode',
      entityId: id,
      payloadBefore: before,
      payloadAfter: after,
    })

    res.json({ item: after })
  }),
)

referralsRouter.delete(
  '/:id',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }

    const existing = await prisma.referralCode.findUnique({
      where: { id },
      include: { _count: { select: { registrations: true } } },
    })
    if (!existing) throw ApiError.notFound('Referral code not found')

    if (existing._count.registrations > 0) {
      throw ApiError.conflict(
        `${existing.code} has been used by ${existing._count.registrations} ` +
          `${existing._count.registrations === 1 ? 'registration' : 'registrations'}. ` +
          'Deactivate it instead — deleting it would erase who brought them in.',
      )
    }

    await prisma.referralCode.delete({ where: { id } })

    await auditRequest(req, {
      action: 'referral.delete',
      entityType: 'ReferralCode',
      entityId: id,
      payloadBefore: existing,
    })

    res.status(204).send()
  }),
)
