import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest, recordAudit } from '../lib/audit.js'
import { runSerializable } from '../lib/transaction.js'
import type { PrismaTransaction } from '../lib/prisma.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import { createDelegateSchema, delegateQuery, updateDelegateSchema, uuidParam } from '../schemas/index.js'

export const delegatesRouter = Router()

/** Whitelisted sort columns — never interpolate user input into orderBy. */
const SORTABLE = new Set(['fullName', 'schoolName', 'grade', 'attendanceStatus', 'createdAt'])

const withAssignment = {
  assignment: {
    select: {
      id: true,
      country: true,
      updatedAt: true,
      committee: { select: { id: true, name: true, code: true } },
    },
  },
} satisfies Prisma.DelegateInclude

type DelegateQuery = {
  page: number
  pageSize: number
  search?: string
  sortBy?: string
  sortDir: 'asc' | 'desc'
  attendanceStatus?: Prisma.DelegateWhereInput['attendanceStatus']
  committeeId?: string
  unassigned?: boolean
}

interface AssignmentInput {
  committeeId?: string | null
  country?: string | null
}

/**
 * Applies committee/country changes for a delegate inside an existing
 * transaction. Committee and country are edited on the delegate record, so
 * this is where the capacity and duplicate-country guarantees live.
 *
 *  - committeeId null      → assignment removed, country freed
 *  - committeeId + country → assignment created or moved
 *  - country only          → renamed within the current committee
 */
async function applyAssignment(
  tx: PrismaTransaction,
  delegateId: string,
  actorId: string,
  input: AssignmentInput,
): Promise<void> {
  const { committeeId, country } = input
  if (committeeId === undefined && country === undefined) return

  const existing = await tx.assignment.findUnique({
    where: { delegateId },
    select: { id: true, committeeId: true, country: true },
  })

  // Explicitly clearing the committee removes the assignment entirely.
  if (committeeId === null) {
    if (existing) await tx.assignment.delete({ where: { id: existing.id } })
    return
  }

  const targetCommitteeId = committeeId ?? existing?.committeeId
  const targetCountry = (country ?? existing?.country ?? '').trim()

  // Nothing to attach to yet — a country with no committee is not an assignment.
  if (!targetCommitteeId) return

  if (targetCountry === '') {
    throw ApiError.badRequest('A country is required when a delegate is placed in a committee')
  }

  const committee = await tx.committee.findUnique({
    where: { id: targetCommitteeId },
    select: { code: true, totalSeats: true },
  })
  if (!committee) throw ApiError.notFound('Committee not found')

  // Only re-check capacity when the delegate is entering a committee they are
  // not already seated in.
  if (existing?.committeeId !== targetCommitteeId) {
    const filled = await tx.assignment.count({ where: { committeeId: targetCommitteeId } })
    if (filled >= committee.totalSeats) {
      throw ApiError.conflict(
        `${committee.code} is full — ${filled} of ${committee.totalSeats} seats are taken.`,
        { filledSeats: filled, totalSeats: committee.totalSeats },
      )
    }
  }

  if (existing) {
    await tx.assignment.update({
      where: { id: existing.id },
      data: { committeeId: targetCommitteeId, country: targetCountry, assignedById: actorId },
    })
  } else {
    await tx.assignment.create({
      data: { delegateId, committeeId: targetCommitteeId, country: targetCountry, assignedById: actorId },
    })
  }
}

/* --------------------------------- Reads ---------------------------------- */
// Both roles may read the delegate list. CONTRIBUTOR is read-only here.

delegatesRouter.get(
  '/',
  validate(delegateQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as DelegateQuery

    const where: Prisma.DelegateWhereInput = {
      ...(q.attendanceStatus ? { attendanceStatus: q.attendanceStatus } : {}),
      ...(q.unassigned ? { assignment: { is: null } } : {}),
      ...(q.committeeId ? { assignment: { is: { committeeId: q.committeeId } } } : {}),
      ...(q.search
        ? {
            OR: [
              { fullName: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
              { schoolName: { contains: q.search, mode: 'insensitive' } },
              { phone: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    // "committee" sorts by committee code and then alphabetically by name,
    // which is the order the attendance desk works in. Unassigned delegates
    // fall to the end rather than the top.
    const orderBy: Prisma.DelegateOrderByWithRelationInput[] =
      q.sortBy === 'committee'
        ? [{ assignment: { committee: { code: q.sortDir } } }, { fullName: 'asc' }]
        : q.sortBy && SORTABLE.has(q.sortBy)
          ? [{ [q.sortBy]: q.sortDir }, { fullName: 'asc' }]
          : [{ fullName: 'asc' }]

    const [items, total] = await Promise.all([
      prisma.delegate.findMany({
        where,
        include: withAssignment,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.delegate.count({ where }),
    ])

    res.json({ items, total, page: q.page, pageSize: q.pageSize })
  }),
)

delegatesRouter.get(
  '/:id',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const delegate = await prisma.delegate.findUnique({ where: { id }, include: withAssignment })
    if (!delegate) throw ApiError.notFound('Delegate not found')
    res.json(delegate)
  }),
)

/* -------------------------------- Mutations ------------------------------- */
// Everything below is ADMIN-only.

delegatesRouter.post(
  '/',
  requireAdmin,
  validate(createDelegateSchema),
  asyncHandler(async (req, res) => {
    const { committeeId, country, ...delegateFields } = req.body as Prisma.DelegateUncheckedCreateInput &
      AssignmentInput
    const actor = currentUser(req)

    const created = await runSerializable(async (tx) => {
      const delegate = await tx.delegate.create({ data: delegateFields })

      await applyAssignment(tx, delegate.id, actor.id, { committeeId, country })

      const full = await tx.delegate.findUniqueOrThrow({
        where: { id: delegate.id },
        include: withAssignment,
      })

      await recordAudit(
        { userId: actor.id, action: 'CREATE', entityType: 'Delegate', entityId: delegate.id, payloadAfter: full },
        tx,
      )

      return full
    })

    req.auditWritten = true
    res.status(201).json(created)
  }),
)

delegatesRouter.patch(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  validate(updateDelegateSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const { committeeId, country, ...delegateFields } = req.body as Prisma.DelegateUncheckedUpdateInput &
      AssignmentInput
    const actor = currentUser(req)

    const updated = await runSerializable(async (tx) => {
      const before = await tx.delegate.findUnique({ where: { id }, include: withAssignment })
      if (!before) throw ApiError.notFound('Delegate not found')

      if (Object.keys(delegateFields).length > 0) {
        await tx.delegate.update({ where: { id }, data: delegateFields })
      }

      await applyAssignment(tx, id, actor.id, { committeeId, country })

      const after = await tx.delegate.findUniqueOrThrow({ where: { id }, include: withAssignment })

      await recordAudit(
        {
          userId: actor.id,
          action: 'UPDATE',
          entityType: 'Delegate',
          entityId: id,
          payloadBefore: before,
          payloadAfter: after,
        },
        tx,
      )

      return after
    })

    req.auditWritten = true
    res.json(updated)
  }),
)

delegatesRouter.delete(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }

    const before = await prisma.delegate.findUnique({ where: { id }, include: withAssignment })
    if (!before) throw ApiError.notFound('Delegate not found')

    // Assignment cascades on delete, which also frees the country for reuse.
    await prisma.delegate.delete({ where: { id } })

    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'Delegate',
      entityId: id,
      payloadBefore: before,
    })

    res.status(204).send()
  }),
)
