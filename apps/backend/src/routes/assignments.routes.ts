import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { recordAudit } from '../lib/audit.js'
import { runSerializable } from '../lib/transaction.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import { createAssignmentSchema, updateAssignmentSchema, uuidParam } from '../schemas/index.js'

export const assignmentsRouter = Router()

const assignmentView = {
  id: true,
  country: true,
  updatedAt: true,
  delegate: { select: { id: true, fullName: true, schoolName: true, attendanceStatus: true } },
  committee: { select: { id: true, name: true, code: true, totalSeats: true } },
  assignedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AssignmentSelect

/* --------------------------------- Reads ---------------------------------- */

assignmentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const committeeId = typeof req.query['committeeId'] === 'string' ? req.query['committeeId'] : undefined

    const items = await prisma.assignment.findMany({
      where: committeeId ? { committeeId } : {},
      select: assignmentView,
      orderBy: [{ committee: { code: 'asc' } }, { country: 'asc' }],
    })

    res.json({ items, total: items.length })
  }),
)

/* -------------------------------- Mutations ------------------------------- */
// Assignment writes are ADMIN-only and always transactional.

assignmentsRouter.post(
  '/',
  requireAdmin,
  validate(createAssignmentSchema),
  asyncHandler(async (req, res) => {
    const { delegateId, committeeId, country } = req.body as {
      delegateId: string
      committeeId: string
      country: string
    }
    const actor = currentUser(req)

    const created = await runSerializable(async (tx) => {
      const [delegate, committee, existing] = await Promise.all([
        tx.delegate.findUnique({ where: { id: delegateId }, select: { id: true, fullName: true } }),
        tx.committee.findUnique({ where: { id: committeeId }, select: { id: true, code: true, totalSeats: true } }),
        tx.assignment.findUnique({ where: { delegateId }, select: { id: true } }),
      ])

      if (!delegate) throw ApiError.notFound('Delegate not found')
      if (!committee) throw ApiError.notFound('Committee not found')
      if (existing) {
        throw ApiError.conflict('This delegate already has an assignment. Update it instead of creating a second one.')
      }

      const filled = await tx.assignment.count({ where: { committeeId } })
      if (filled >= committee.totalSeats) {
        throw ApiError.conflict(
          `${committee.code} is full — ${filled} of ${committee.totalSeats} seats are taken.`,
          { filledSeats: filled, totalSeats: committee.totalSeats },
        )
      }

      const assignment = await tx.assignment.create({
        data: { delegateId, committeeId, country, assignedById: actor.id },
        select: assignmentView,
      })

      // Written inside the transaction so the trail can never disagree with
      // the data it describes.
      await recordAudit(
        {
          userId: actor.id,
          action: 'CREATE',
          entityType: 'Assignment',
          entityId: assignment.id,
          payloadAfter: assignment,
        },
        tx,
      )

      return assignment
    })

    req.auditWritten = true
    res.status(201).json(created)
  }),
)

assignmentsRouter.patch(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  validate(updateAssignmentSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const body = req.body as { committeeId?: string; country?: string }
    const actor = currentUser(req)

    const updated = await runSerializable(async (tx) => {
      const before = await tx.assignment.findUnique({ where: { id }, select: assignmentView })
      if (!before) throw ApiError.notFound('Assignment not found')

      const targetCommitteeId = body.committeeId ?? before.committee.id

      // Only re-check capacity when the delegate is actually moving rooms.
      if (body.committeeId && body.committeeId !== before.committee.id) {
        const committee = await tx.committee.findUnique({
          where: { id: targetCommitteeId },
          select: { code: true, totalSeats: true },
        })
        if (!committee) throw ApiError.notFound('Committee not found')

        const filled = await tx.assignment.count({ where: { committeeId: targetCommitteeId } })
        if (filled >= committee.totalSeats) {
          throw ApiError.conflict(
            `${committee.code} is full — ${filled} of ${committee.totalSeats} seats are taken.`,
            { filledSeats: filled, totalSeats: committee.totalSeats },
          )
        }
      }

      const after = await tx.assignment.update({
        where: { id },
        data: {
          ...(body.committeeId ? { committeeId: body.committeeId } : {}),
          ...(body.country ? { country: body.country } : {}),
          assignedById: actor.id,
        },
        select: assignmentView,
      })

      await recordAudit(
        {
          userId: actor.id,
          action: 'UPDATE',
          entityType: 'Assignment',
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

assignmentsRouter.delete(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const actor = currentUser(req)

    await runSerializable(async (tx) => {
      const before = await tx.assignment.findUnique({ where: { id }, select: assignmentView })
      if (!before) throw ApiError.notFound('Assignment not found')

      await tx.assignment.delete({ where: { id } })

      await recordAudit(
        {
          userId: actor.id,
          action: 'DELETE',
          entityType: 'Assignment',
          entityId: id,
          payloadBefore: before,
        },
        tx,
      )
    })

    req.auditWritten = true
    res.status(204).send()
  }),
)
