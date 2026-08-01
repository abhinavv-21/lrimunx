import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest } from '../lib/audit.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { requireAdmin } from '../middleware/rbac.js'
import {
  awardParams,
  createAwardSchema,
  createCommitteeSchema,
  rankForAward,
  updateAwardSchema,
  updateCommitteeSchema,
  uuidParam,
} from '../schemas/index.js'

export const committeesRouter = Router()

/** The award shape every awards response returns. */
const awardView = {
  id: true,
  title: true,
  rank: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  delegate: { select: { id: true, fullName: true, schoolName: true } },
} satisfies Prisma.AwardSelect

/** Ceremony order, then oldest first so ties keep the order they were added. */
const awardOrder: Prisma.AwardOrderByWithRelationInput[] = [{ rank: 'asc' }, { createdAt: 'asc' }]

/** Committee plus seat usage — the shape every committee view needs. */
async function listWithCapacity() {
  const committees = await prisma.committee.findMany({
    orderBy: { code: 'asc' },
    include: {
      _count: {
        select: {
          assignments: true,
          // Unresolved only. A card reading "4 requests" when all four were
          // closed yesterday sends someone to a room that needs nothing.
          requests: { where: { status: { not: 'RESOLVED' } } },
          awards: true,
        },
      },
      // Which countries are already spoken for. Allocations needs this to warn
      // about a clash while it is being typed, rather than letting the unique
      // constraint reject the save after the fact.
      assignments: {
        orderBy: { country: 'asc' },
        select: { country: true, delegateId: true, delegate: { select: { fullName: true } } },
      },
    },
  })

  return committees.map(({ _count, assignments, ...committee }) => ({
    ...committee,
    filledSeats: _count.assignments,
    openRequests: _count.requests,
    awardCount: _count.awards,
    seatsRemaining: committee.totalSeats - _count.assignments,
    takenCountries: assignments.map((a) => ({
      country: a.country,
      delegateId: a.delegateId,
      delegateName: a.delegate.fullName,
    })),
  }))
}

/* --------------------------------- Reads ---------------------------------- */
// Both roles read committees — contributors need them to file a request
// against the right room.

committeesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ items: await listWithCapacity() })
  }),
)

committeesRouter.get(
  '/:id',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }

    const committee = await prisma.committee.findUnique({
      where: { id },
      include: {
        _count: { select: { assignments: true, requests: true } },
        assignments: {
          orderBy: { country: 'asc' },
          select: {
            id: true,
            country: true,
            delegate: {
              select: {
                id: true,
                fullName: true,
                schoolName: true,
                email: true,
                phone: true,
                attendanceStatus: true,
              },
            },
          },
        },
        // The committee's own slice of the logistics board. The cumulative
        // view still lives on /logistics and the dashboard; this is the same
        // data filtered to one room.
        requests: {
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            title: true,
            category: true,
            description: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            committee: { select: { id: true, name: true, code: true } },
            createdBy: { select: { id: true, fullName: true } },
            resolvedBy: { select: { id: true, fullName: true } },
          },
        },
        awards: { orderBy: awardOrder, select: awardView },
      },
    })
    if (!committee) throw ApiError.notFound('Committee not found')

    const { _count, ...rest } = committee
    res.json({
      ...rest,
      filledSeats: _count.assignments,
      // Genuinely open work, not every request ever filed against the room.
      openRequests: committee.requests.filter((r) => r.status !== 'RESOLVED').length,
      totalRequests: _count.requests,
      seatsRemaining: committee.totalSeats - _count.assignments,
    })
  }),
)

/* --------------------------------- Awards --------------------------------- */
// Reading is open to both roles — contributors run the ceremony desk and need
// the list. Every write is ADMIN-only and audited.

committeesRouter.get(
  '/:id/awards',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }

    const committee = await prisma.committee.findUnique({ where: { id }, select: { id: true } })
    if (!committee) throw ApiError.notFound('Committee not found')

    res.json({
      items: await prisma.award.findMany({ where: { committeeId: id }, orderBy: awardOrder, select: awardView }),
    })
  }),
)

/**
 * A recipient must actually sit in this committee — awarding Best Delegate in
 * UNSC to someone assigned to DISEC is always a mistake, and the database
 * cannot express that constraint on its own.
 */
async function assertDelegateInCommittee(committeeId: string, delegateId: string): Promise<void> {
  const assignment = await prisma.assignment.findUnique({
    where: { delegateId },
    select: { committeeId: true, delegate: { select: { fullName: true } } },
  })

  if (!assignment) throw ApiError.badRequest('That delegate has not been allocated to a committee yet')
  if (assignment.committeeId !== committeeId) {
    throw ApiError.badRequest(`${assignment.delegate.fullName} is allocated to a different committee`)
  }
}

/** P2002 on the composite unique means this delegate already holds an award here. */
function rethrowDuplicateAward(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw ApiError.conflict('That delegate already has an award in this committee')
  }
  throw error
}

committeesRouter.post(
  '/:id/awards',
  requireAdmin,
  validate(uuidParam, 'params'),
  validate(createAwardSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const body = req.body as { title: string; delegateId?: string | null; note?: string | null }

    const committee = await prisma.committee.findUnique({ where: { id }, select: { id: true } })
    if (!committee) throw ApiError.notFound('Committee not found')

    const delegateId = body.delegateId ?? null
    if (delegateId) await assertDelegateInCommittee(id, delegateId)

    const created = await prisma.award
      .create({
        data: {
          committeeId: id,
          title: body.title,
          rank: rankForAward(body.title),
          delegateId,
          note: body.note ?? null,
        },
        select: awardView,
      })
      .catch(rethrowDuplicateAward)

    await auditRequest(req, {
      action: 'CREATE',
      entityType: 'Award',
      entityId: created.id,
      payloadAfter: created,
    })

    res.status(201).json(created)
  }),
)

committeesRouter.patch(
  '/:id/awards/:awardId',
  requireAdmin,
  validate(awardParams, 'params'),
  validate(updateAwardSchema),
  asyncHandler(async (req, res) => {
    const { id, awardId } = req.params as { id: string; awardId: string }
    const body = req.body as { title?: string; delegateId?: string | null; note?: string | null }

    const before = await prisma.award.findUnique({ where: { id: awardId }, select: { ...awardView, committeeId: true } })
    if (!before || before.committeeId !== id) throw ApiError.notFound('Award not found in this committee')

    if (body.delegateId) await assertDelegateInCommittee(id, body.delegateId)

    const after = await prisma.award
      .update({
        where: { id: awardId },
        data: {
          // Retitling re-ranks: an award renamed to Best Delegate belongs at
          // the top of the ceremony, not wherever it used to sit.
          ...(body.title !== undefined ? { title: body.title, rank: rankForAward(body.title) } : {}),
          ...(body.delegateId !== undefined ? { delegateId: body.delegateId ?? null } : {}),
          ...(body.note !== undefined ? { note: body.note ?? null } : {}),
        },
        select: awardView,
      })
      .catch(rethrowDuplicateAward)

    await auditRequest(req, {
      action: 'UPDATE',
      entityType: 'Award',
      entityId: awardId,
      payloadBefore: before,
      payloadAfter: after,
    })

    res.json(after)
  }),
)

committeesRouter.delete(
  '/:id/awards/:awardId',
  requireAdmin,
  validate(awardParams, 'params'),
  asyncHandler(async (req, res) => {
    const { id, awardId } = req.params as { id: string; awardId: string }

    const before = await prisma.award.findUnique({ where: { id: awardId }, select: { ...awardView, committeeId: true } })
    if (!before || before.committeeId !== id) throw ApiError.notFound('Award not found in this committee')

    await prisma.award.delete({ where: { id: awardId } })

    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'Award',
      entityId: awardId,
      payloadBefore: before,
    })

    res.status(204).send()
  }),
)

/* -------------------------------- Mutations ------------------------------- */

committeesRouter.post(
  '/',
  requireAdmin,
  validate(createCommitteeSchema),
  asyncHandler(async (req, res) => {
    const committee = await prisma.committee.create({
      data: req.body as Prisma.CommitteeUncheckedCreateInput,
    })

    await auditRequest(req, {
      action: 'CREATE',
      entityType: 'Committee',
      entityId: committee.id,
      payloadAfter: committee,
    })

    res.status(201).json({
      ...committee,
      filledSeats: 0,
      openRequests: 0,
      awardCount: 0,
      seatsRemaining: committee.totalSeats,
      takenCountries: [],
    })
  }),
)

committeesRouter.patch(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  validate(updateCommitteeSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const body = req.body as { totalSeats?: number; name?: string; code?: string }

    const before = await prisma.committee.findUnique({
      where: { id },
      include: { _count: { select: { assignments: true } } },
    })
    if (!before) throw ApiError.notFound('Committee not found')

    // Shrinking a committee below its filled seats would strand delegates.
    if (body.totalSeats !== undefined && body.totalSeats < before._count.assignments) {
      throw ApiError.conflict(
        `Cannot reduce to ${body.totalSeats} seats — ${before._count.assignments} are already assigned. Reassign those delegates first.`,
        { filledSeats: before._count.assignments, requestedSeats: body.totalSeats },
      )
    }

    const after = await prisma.committee.update({ where: { id }, data: body })

    await auditRequest(req, {
      action: 'UPDATE',
      entityType: 'Committee',
      entityId: id,
      payloadBefore: before,
      payloadAfter: after,
    })

    res.json({
      ...after,
      filledSeats: before._count.assignments,
      seatsRemaining: after.totalSeats - before._count.assignments,
    })
  }),
)

committeesRouter.delete(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }

    const before = await prisma.committee.findUnique({
      where: { id },
      include: { _count: { select: { assignments: true, requests: true } } },
    })
    if (!before) throw ApiError.notFound('Committee not found')

    // Assignments cascade, but silently deleting a room full of delegates is
    // never what the operator meant.
    if (before._count.assignments > 0) {
      throw ApiError.conflict(
        `${before._count.assignments} delegates are assigned to this committee. Reassign them before deleting it.`,
        { filledSeats: before._count.assignments },
      )
    }

    await prisma.committee.delete({ where: { id } })

    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'Committee',
      entityId: id,
      payloadBefore: before,
    })

    res.status(204).send()
  }),
)
