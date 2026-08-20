import { Router } from 'express'
import { AttendanceStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import type { PrismaTransaction } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { recordAudit } from '../lib/audit.js'
import { CONFERENCE_DAYS, defaultDay, readConferenceMode } from '../lib/conference.js'
import { runSerializable } from '../lib/transaction.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import { attendanceSummaryQuery, bulkCheckInSchema, checkInSchema } from '../schemas/index.js'

export const attendanceRouter = Router()

/**
 * Rewrites `Delegate.attendanceStatus` for the delegates named, from the
 * per-day rows that are now the truth.
 *
 * The column stays because "has this person turned up at all" is what the
 * delegates list, the exports and the dashboard count, and answering that from
 * three rows each would put a join on every one of those screens. It is a
 * mirror, so it is rewritten here rather than assumed: a delegate is CHECKED_IN
 * exactly when at least one day says so, which means clearing day 1 for someone
 * who came on day 2 correctly leaves them present.
 */
async function refreshAttendanceMirror(tx: PrismaTransaction, delegateIds: string[]): Promise<void> {
  const seen = { attendance: { some: { status: AttendanceStatus.CHECKED_IN } } }

  await tx.delegate.updateMany({
    where: { id: { in: delegateIds }, ...seen },
    data: { attendanceStatus: AttendanceStatus.CHECKED_IN },
  })
  await tx.delegate.updateMany({
    where: { id: { in: delegateIds }, NOT: seen },
    data: { attendanceStatus: AttendanceStatus.ABSENT },
  })
}

attendanceRouter.get(
  '/summary',
  validate(attendanceSummaryQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { day: requested } = req.query as unknown as { day?: number }
    const mode = await readConferenceMode()
    const day = requested ?? defaultDay(mode)

    const [total, perDay, byCommittee] = await Promise.all([
      prisma.delegate.count(),
      // One grouped query for all three days rather than three counts, so the
      // day tabs can show their numbers without three more round trips.
      prisma.delegateAttendance.groupBy({
        by: ['day'],
        where: { status: AttendanceStatus.CHECKED_IN },
        _count: { _all: true },
      }),
      prisma.committee.findMany({
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          totalSeats: true,
          assignments: {
            select: { delegate: { select: { attendance: { where: { day }, select: { status: true } } } } },
          },
        },
      }),
    ])

    const checkedInByDay = new Map(perDay.map((row) => [row.day, row._count._all]))
    const checkedIn = checkedInByDay.get(day) ?? 0

    res.json({
      day,
      state: mode.state,
      activeDay: mode.activeDay,
      checkedIn,
      absent: total - checkedIn,
      total,
      days: CONFERENCE_DAYS.map((entry) => ({
        day: entry.day,
        date: entry.date,
        checkedIn: checkedInByDay.get(entry.day) ?? 0,
        absent: total - (checkedInByDay.get(entry.day) ?? 0),
      })),
      committees: byCommittee.map((c) => {
        const present = c.assignments.filter(
          (a) => a.delegate.attendance[0]?.status === AttendanceStatus.CHECKED_IN,
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
    const { delegateId, status, day: requested } = req.body as {
      delegateId: string
      status: AttendanceStatus
      day?: number
    }
    const actor = currentUser(req)

    const mode = await readConferenceMode()
    const day = requested ?? defaultDay(mode)

    // Serializable: two tables move together here — the day row and the mirror
    // on Delegate — and a check-in racing the same delegate's other day would
    // otherwise be able to leave the mirror saying ABSENT for someone standing
    // at the desk.
    const result = await runSerializable(async (tx) => {
      const delegate = await tx.delegate.findUnique({
        where: { id: delegateId },
        select: { id: true, fullName: true },
      })
      if (!delegate) throw ApiError.notFound('Delegate not found')

      const before = await tx.delegateAttendance.findUnique({
        where: { delegateId_day: { delegateId, day } },
        select: { status: true },
      })

      if (before?.status === status) {
        return { delegate, day, status, unchanged: true as const }
      }

      await tx.delegateAttendance.upsert({
        where: { delegateId_day: { delegateId, day } },
        update: { status },
        create: { delegateId, day, status },
      })

      await refreshAttendanceMirror(tx, [delegateId])

      await recordAudit(
        {
          userId: actor.id,
          action: 'CHECK_IN',
          entityType: 'Delegate',
          entityId: delegateId,
          payloadBefore: { day, status: before?.status ?? AttendanceStatus.ABSENT },
          payloadAfter: { day, status },
        },
        tx,
      )

      return { delegate, day, status, unchanged: false as const }
    })

    if (!result.unchanged) req.auditWritten = true

    res.json({
      id: result.delegate.id,
      fullName: result.delegate.fullName,
      day: result.day,
      attendanceStatus: result.status,
      ...(result.unchanged ? { unchanged: true } : {}),
    })
  }),
)

attendanceRouter.post(
  '/bulk-check-in',
  requireAdmin,
  validate(bulkCheckInSchema),
  asyncHandler(async (req, res) => {
    const { delegateIds, status, day: requested } = req.body as {
      delegateIds: string[]
      status: AttendanceStatus
      day?: number
    }
    const actor = currentUser(req)

    const mode = await readConferenceMode()
    const day = requested ?? defaultDay(mode)

    const result = await runSerializable(async (tx) => {
      const delegates = await tx.delegate.findMany({
        where: { id: { in: delegateIds } },
        select: { id: true },
      })

      const found = delegates.map((d) => d.id)
      const foundSet = new Set(found)
      const missing = delegateIds.filter((id) => !foundSet.has(id))

      const existing = await tx.delegateAttendance.findMany({
        where: { delegateId: { in: found }, day },
        select: { delegateId: true, status: true },
      })
      const existingFor = new Map(existing.map((row) => [row.delegateId, row.status]))

      // Set arithmetic rather than one upsert per delegate: this runs inside a
      // SERIALIZABLE transaction on the same box as everything else, and four
      // statements hold that lock for a great deal less time than four hundred.
      const changing = found.filter((id) => existingFor.get(id) !== status)
      const toUpdate = changing.filter((id) => existingFor.has(id))
      const toCreate = changing.filter((id) => !existingFor.has(id))

      if (toUpdate.length > 0) {
        await tx.delegateAttendance.updateMany({
          where: { delegateId: { in: toUpdate }, day },
          data: { status },
        })
      }
      if (toCreate.length > 0) {
        await tx.delegateAttendance.createMany({
          data: toCreate.map((delegateId) => ({ delegateId, day, status })),
        })
      }

      if (changing.length > 0) {
        await refreshAttendanceMirror(tx, changing)

        await recordAudit(
          {
            userId: actor.id,
            action: 'CHECK_IN',
            entityType: 'Delegate',
            entityId: `bulk:${changing.length}`,
            payloadBefore: {
              day,
              delegates: changing.map((id) => ({
                id,
                status: existingFor.get(id) ?? AttendanceStatus.ABSENT,
              })),
            },
            payloadAfter: { day, delegateIds: changing, attendanceStatus: status },
          },
          tx,
        )
      }

      return { day, updated: changing.length, unchanged: found.length - changing.length, missing }
    })

    if (result.updated > 0) req.auditWritten = true

    res.json(result)
  }),
)
