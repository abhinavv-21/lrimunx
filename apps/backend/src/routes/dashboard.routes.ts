import { Router } from 'express'
import { AttendanceStatus, RequestStatus, Role } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'

export const dashboardRouter = Router()

/**
 * Both roles get a dashboard. The shape differs by responsibility, not by
 * device — an admin sees the whole conference, a contributor sees the board
 * they act on.
 */
dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const actor = currentUser(req)

    const [
      totalDelegates,
      checkedIn,
      unassigned,
      openRequests,
      inProgressRequests,
      committees,
    ] = await Promise.all([
      prisma.delegate.count(),
      prisma.delegate.count({ where: { attendanceStatus: AttendanceStatus.CHECKED_IN } }),
      prisma.delegate.count({ where: { assignment: { is: null } } }),
      prisma.logisticsReq.count({ where: { status: RequestStatus.OPEN } }),
      prisma.logisticsReq.count({ where: { status: RequestStatus.IN_PROGRESS } }),
      prisma.committee.findMany({
        orderBy: { code: 'asc' },
        include: { _count: { select: { assignments: true } } },
      }),
    ])

    const capacity = committees.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      totalSeats: c.totalSeats,
      filledSeats: c._count.assignments,
      seatsRemaining: c.totalSeats - c._count.assignments,
    }))

    const recentRequests = await prisma.logisticsReq.findMany({
      where: actor.role === Role.ADMIN ? {} : { createdById: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        createdAt: true,
        committee: { select: { code: true } },
      },
    })

    // The admin view adds figures only the secretariat can act on.
    const adminOnly =
      actor.role === Role.ADMIN
        ? {
            unassigned,
            recentAudit: await prisma.auditLog.findMany({
              orderBy: { timestamp: 'desc' },
              take: 5,
              select: {
                id: true,
                action: true,
                entityType: true,
                entityId: true,
                timestamp: true,
                user: { select: { fullName: true } },
              },
            }),
          }
        : {}

    res.json({
      role: actor.role,
      totalDelegates,
      checkedIn,
      absent: totalDelegates - checkedIn,
      openRequests,
      inProgressRequests,
      capacity,
      recentRequests,
      ...adminOnly,
    })
  }),
)
