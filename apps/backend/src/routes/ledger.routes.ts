import { Router } from 'express'
import { Prisma, RegistrationStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest } from '../lib/audit.js'
import { readTierPrices } from '../lib/conference.js'
import {
  LEDGER_CATEGORY_SUGGESTIONS,
  canonicalCategory,
  summariseLedger,
} from '../lib/ledger.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import {
  createLedgerEntrySchema,
  ledgerQuery,
  updateLedgerEntrySchema,
  uuidParam,
} from '../schemas/index.js'

export const ledgerRouter = Router()

// The books are the secretariat's, not the whole hub's. A contributor filing
// placard requests has no reason to see what the venue cost.
ledgerRouter.use(requireAdmin)

const entryView = {
  id: true,
  entryDate: true,
  particular: true,
  category: true,
  credit: true,
  debit: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  recordedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.LedgerEntrySelect

interface LedgerListQuery {
  page: number
  pageSize: number
  search?: string
  sortDir: 'asc' | 'desc'
  category?: string
  from?: Date
  to?: Date
}

// Money that was recorded against a rejected application is money that is being
// refunded, and counting it as income would close the books on a figure the
// bank statement does not have. Pending and approved both count: the cash is in
// the tin either way.
const INCOME_STATUSES = [RegistrationStatus.PENDING, RegistrationStatus.APPROVED]

/**
 * The spelling this line will be filed under.
 *
 * The category is free text, so nothing stops a treasurer typing "venue" on
 * Monday and "Venue" on Tuesday — and the summary groups on the column, so that
 * is two rows for one thing. Matching case-insensitively against the
 * suggestions and against what is already in the books settles it on one
 * spelling. A genuinely new category is stored exactly as typed.
 */
async function settleCategory(typed: string): Promise<string> {
  const inUse = await prisma.ledgerEntry.findMany({
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  })

  return canonicalCategory(typed, [
    ...LEDGER_CATEGORY_SUGGESTIONS,
    ...inUse.map((row) => row.category),
  ])
}

ledgerRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    // Every number below is a SQL aggregate. The finance screen has to work on
    // a box that is also running Postgres and the API, so nothing here pulls
    // rows into Node to add them up.
    const [byTier, unrecorded, byCategory, prices] = await Promise.all([
      prisma.registration.groupBy({
        by: ['priceTier'],
        where: { status: { in: INCOME_STATUSES }, amountPaid: { not: null } },
        _count: { _all: true },
        _sum: { amountPaid: true },
      }),
      prisma.registration.count({
        where: { status: { in: INCOME_STATUSES }, amountPaid: { not: null }, priceTier: null },
      }),
      prisma.ledgerEntry.groupBy({
        by: ['category'],
        _sum: { credit: true, debit: true },
      }),
      readTierPrices(),
    ])

    res.json(
      summariseLedger({
        registrationGroups: byTier.map((row) => ({
          priceTier: row.priceTier,
          count: row._count._all,
          total: row._sum.amountPaid,
        })),
        unrecorded,
        ledgerGroups: byCategory.map((row) => ({
          category: row.category,
          credit: row._sum.credit,
          debit: row._sum.debit,
        })),
        prices,
      }),
    )
  }),
)

ledgerRouter.get(
  '/',
  validate(ledgerQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as LedgerListQuery

    const where: Prisma.LedgerEntryWhereInput = {
      ...(q.category ? { category: q.category } : {}),
      ...(q.from || q.to
        ? { entryDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
        : {}),
      ...(q.search
        ? {
            OR: [
              { particular: { contains: q.search, mode: 'insensitive' } },
              { note: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [items, total, totals] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        select: entryView,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.ledgerEntry.count({ where }),
      // Totals for the filter, not for the page. A treasurer filtering to FOOD
      // wants what food cost, not what the fifty rows they can see cost.
      prisma.ledgerEntry.aggregate({ where, _sum: { credit: true, debit: true } }),
    ])

    res.json({
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      totals: { credit: totals._sum.credit ?? 0, debit: totals._sum.debit ?? 0 },
    })
  }),
)

ledgerRouter.post(
  '/',
  validate(createLedgerEntrySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      entryDate: Date
      particular: string
      category: string
      credit: number
      debit: number
      note?: string | null
    }
    const actor = currentUser(req)

    const created = await prisma.ledgerEntry.create({
      data: {
        ...body,
        category: await settleCategory(body.category),
        note: body.note ?? null,
        recordedById: actor.id,
      },
      select: entryView,
    })

    await auditRequest(req, {
      action: 'CREATE',
      entityType: 'LedgerEntry',
      entityId: created.id,
      payloadAfter: created,
    })

    res.status(201).json(created)
  }),
)

ledgerRouter.patch(
  '/:id',
  validate(uuidParam, 'params'),
  validate(updateLedgerEntrySchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{
      entryDate: Date
      particular: string
      category: string
      credit: number
      debit: number
      note: string | null
    }>

    const before = await prisma.ledgerEntry.findUnique({ where: { id }, select: entryView })
    if (!before) throw ApiError.notFound('Ledger entry not found')

    // The schema can only check a pair it was given both halves of. Patching
    // credit alone on a line that already carries a debit is how a row ends up
    // being money in and money out at once.
    const credit = body.credit ?? before.credit
    const debit = body.debit ?? before.debit
    if ((credit > 0) === (debit > 0)) {
      throw ApiError.unprocessable(
        'Put the amount in either credit or debit — a line cannot be both, and a line of zero is not a line',
        { credit, debit },
      )
    }

    const data =
      body.category === undefined
        ? body
        : { ...body, category: await settleCategory(body.category) }

    const after = await prisma.ledgerEntry.update({ where: { id }, data, select: entryView })

    await auditRequest(req, {
      action: 'UPDATE',
      entityType: 'LedgerEntry',
      entityId: id,
      payloadBefore: before,
      payloadAfter: after,
    })

    res.json(after)
  }),
)

ledgerRouter.delete(
  '/:id',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }

    const before = await prisma.ledgerEntry.findUnique({ where: { id }, select: entryView })
    if (!before) throw ApiError.notFound('Ledger entry not found')

    await prisma.ledgerEntry.delete({ where: { id } })

    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'LedgerEntry',
      entityId: id,
      payloadBefore: before,
    })

    res.status(204).send()
  }),
)
