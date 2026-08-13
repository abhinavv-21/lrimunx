import { Router } from 'express'
import { AttendanceStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { recordAudit } from '../lib/audit.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import { bulkCheckInSchema, checkInSchema } from '../schemas/index.js'

export const attendanceRouter = Router()

attendanceRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const [checkedIn, total, byCommittee] = await Promise.all([
      prisma.delegate.count({ where: { attendanceStatus: AttendanceStatus.CHECKED_IN } }),
      prisma.delegate.count(),
      prisma.committee.findMany({
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          totalSeats: true,
          assignments: { select: { delegate: { select: { attendanceStatus: true } } } },
        },
      }),
    ])

    res.json({
      checkedIn,
      absent: total - checkedIn,
      total,
      committees: byCommittee.map((c) => {
        const present = c.assignments.filter(
          (a) => a.delegate.attendanceStatus === AttendanceStatus.CHECKED_IN,
        ).length
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          assigned: c.assignments.length,
          checkedIn: present,
          totalSeats: c.totalSeats,
        }
      }),
    })
  }),
)

attendanceRouter.post(
  '/check-in',
  validate(checkInSchema),
  asyncHandler(async (req, res) => {
    const { delegateId, status } = req.body as { delegateId: string; status: AttendanceStatus }
    const actor = currentUser(req)

    const before = await prisma.delegate.findUnique({
      where: { id: delegateId },
      select: { id: true, fullName: true, attendanceStatus: true },
    })
    if (!before) throw ApiError.notFound('Delegate not found')

    if (before.attendanceStatus === status) {
      res.json({ ...before, unchanged: true })
      return
    }

    const after = await prisma.delegate.update({
      where: { id: delegateId },
      data: { attendanceStatus: status },
      select: { id: true, fullName: true, attendanceStatus: true },
    })

    await recordAudit({
      userId: actor.id,
      action: 'CHECK_IN',
      entityType: 'Delegate',
      entityId: delegateId,
      payloadBefore: before,
      payloadAfter: after,
    })
    req.auditWritten = true

    res.json(after)
  }),
)

attendanceRouter.post(
  '/bulk-check-in',
  requireAdmin,
  validate(bulkCheckInSchema),
  asyncHandler(async (req, res) => {
    const { delegateIds, status } = req.body as { delegateIds: string[]; status: AttendanceStatus }
    const actor = currentUser(req)

    const before = await prisma.delegate.findMany({
      where: { id: { in: delegateIds } },
      select: { id: true, fullName: true, attendanceStatus: true },
    })

    const found = new Set(before.map((d) => d.id))
    const missing = delegateIds.filter((id) => !found.has(id))
    const changing = before.filter((d) => d.attendanceStatus !== status).map((d) => d.id)

    if (changing.length > 0) {
      await prisma.$transaction([
        prisma.delegate.updateMany({ where: { id: { in: changing } }, data: { attendanceStatus: status } }),
        prisma.auditLog.create({
          data: {
            userId: actor.id,
            action: 'CHECK_IN',
            entityType: 'Delegate',
            entityId: `bulk:${changing.length}`,
            payloadBefore: { delegates: before.filter((d) => changing.includes(d.id)) },
            payloadAfter: { delegateIds: changing, attendanceStatus: status },
          },
        }),
      ])
      req.auditWritten = true
    }

    res.json({ updated: changing.length, unchanged: before.length - changing.length, missing })
  }),
)
