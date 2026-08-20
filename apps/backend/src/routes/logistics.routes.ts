import { Router } from 'express'
import { Prisma, RequestCategory, RequestStatus, Role } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest } from '../lib/audit.js'
import { notifyAdmins } from '../lib/push.js'
import { computePriority, type PriorityLevel } from '../lib/logistics.js'
import { defaultDay, readConferenceMode } from '../lib/conference.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import { createLogisticsSchema, logisticsQuery, updateLogisticsSchema, uuidParam } from '../schemas/index.js'

export const logisticsRouter = Router()

const DEDUPE_WINDOW_MS = 15 * 60_000

/**
 * How many rows `sortBy=priority` will consider.
 *
 * Priority is computed from the clock (see lib/logistics.ts), so Postgres
 * cannot ORDER BY it without the rule being written twice — once in SQL and
 * once here — and two copies of a rule is one copy that drifts. Instead the
 * newest N matching rows are scored in Node and paged from there.
 *
 * 500 is well past what a three-day school MUN files; the cap exists so this
 * cannot become an unbounded read on a box that is also running Postgres, and
 * if it is ever hit, the rows dropped are the oldest, which are the ones nobody
 * is sorting by urgency any more.
 */
const PRIORITY_SORT_CAP = 500

const requestView = {
  id: true,
  title: true,
  category: true,
  description: true,
  status: true,
  day: true,
  createdAt: true,
  updatedAt: true,
  committee: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, fullName: true } },
  resolvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.LogisticsReqSelect

type LogisticsQuery = {
  page: number
  pageSize: number
  search?: string
  sortDir: 'asc' | 'desc'
  sortBy?: string
  status?: RequestStatus
  category?: RequestCategory
  committeeId?: string
  day?: number
  mine?: boolean
}

type RequestRow = Prisma.LogisticsReqGetPayload<{ select: typeof requestView }>

type PrioritisedRow = RequestRow & { priority: number; priorityLevel: PriorityLevel }

function withPriority(row: RequestRow, conferenceRunning: boolean, now: Date): PrioritisedRow {
  const { score, level } = computePriority({
    category: row.category,
    status: row.status,
    createdAt: row.createdAt,
    conferenceRunning,
    now,
  })
  return { ...row, priority: score, priorityLevel: level }
}

logisticsRouter.get(
  '/',
  validate(logisticsQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as LogisticsQuery
    const actor = currentUser(req)

    const where: Prisma.LogisticsReqWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.committeeId ? { committeeId: q.committeeId } : {}),
      ...(q.day !== undefined ? { day: q.day } : {}),
      ...(q.mine ? { createdById: actor.id } : {}),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: 'insensitive' } },
              { description: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const mode = await readConferenceMode()
    const running = mode.state === 'RUNNING'
    const now = new Date()

    if (q.sortBy === 'priority') {
      const [rows, total] = await Promise.all([
        prisma.logisticsReq.findMany({
          where,
          select: requestView,
          orderBy: { createdAt: 'desc' },
          take: PRIORITY_SORT_CAP,
        }),
        prisma.logisticsReq.count({ where }),
      ])

      const sorted = rows
        .map((row) => withPriority(row, running, now))
        .sort((a, b) =>
          q.sortDir === 'asc' ? a.priority - b.priority : b.priority - a.priority,
        )

      const start = (q.page - 1) * q.pageSize
      res.json({
        items: sorted.slice(start, start + q.pageSize),
        total,
        page: q.page,
        pageSize: q.pageSize,
        // The client needs to know it is looking at a window, not the whole set.
        priorityWindow: Math.min(total, PRIORITY_SORT_CAP),
      })
      return
    }

    const [items, total] = await Promise.all([
      prisma.logisticsReq.findMany({
        where,
        select: requestView,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.logisticsReq.count({ where }),
    ])

    res.json({
      items: items.map((row) => withPriority(row, running, now)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    })
  }),
)

logisticsRouter.get(
  '/:id',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const request = await prisma.logisticsReq.findUnique({ where: { id }, select: requestView })
    if (!request) throw ApiError.notFound('Logistics request not found')

    const mode = await readConferenceMode()
    res.json(withPriority(request, mode.state === 'RUNNING', new Date()))
  }),
)

logisticsRouter.post(
  '/',
  validate(createLogisticsSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      title: string
      category: RequestCategory
      description: string
      committeeId?: string | null
      day?: number | null
    }
    const actor = currentUser(req)
    const committeeId = body.committeeId ?? null

    // A request filed during the conference belongs to the day it was filed on
    // unless someone says otherwise. Before the conference starts it belongs to
    // no day: pinning three weeks of pre-conference errands to day 1 would bury
    // the first morning's queue under them.
    const mode = await readConferenceMode()
    const day = body.day ?? (mode.state === 'RUNNING' ? defaultDay(mode) : null)

    if (committeeId) {
      const committee = await prisma.committee.findUnique({ where: { id: committeeId }, select: { id: true } })
      if (!committee) throw ApiError.notFound('Committee not found')
    }

    const duplicate = await prisma.logisticsReq.findFirst({
      where: {
        createdById: actor.id,
        title: body.title,
        description: body.description,
        category: body.category,
        committeeId,
        day,
        createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
      },
      select: requestView,
    })

    const running = mode.state === 'RUNNING'
    const now = new Date()

    if (duplicate) {
      res.status(200).json({ ...withPriority(duplicate, running, now), deduplicated: true })
      return
    }

    const created = await prisma.logisticsReq.create({
      data: {
        title: body.title,
        category: body.category,
        description: body.description,
        committeeId,
        day,
        createdById: actor.id,
      },
      select: requestView,
    })

    if (actor.role === Role.ADMIN) {
      await auditRequest(req, {
        action: 'CREATE',
        entityType: 'LogisticsReq',
        entityId: created.id,
        payloadAfter: created,
      })
    }

    // Same rule the list sorts on, rather than a second category set that would
    // quietly disagree with it. A brand new PLACARD or LOGISTICS request scores
    // HIGH; everything else has to wait to get there.
    const { level } = computePriority({
      category: created.category,
      status: created.status,
      createdAt: created.createdAt,
      conferenceRunning: running,
      now,
    })

    void notifyAdmins({
      title: `${level === 'CRITICAL' || level === 'HIGH' ? 'High priority' : 'New request'}: ${created.committee?.code ?? 'General'}`,
      body: created.title,
      // Must carry the /admin base: the service worker navigates to this
      // verbatim, so an un-prefixed path lands on the public site.
      url: `/admin/logistics/${created.id}`,
      tag: `logistics-${created.id}`,
    }).catch((error) => console.warn('[push] logistics alert failed:', error))

    res.status(201).json(withPriority(created, running, now))
  }),
)

logisticsRouter.patch(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  validate(updateLogisticsSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const body = req.body as { status?: RequestStatus; committeeId?: string | null; day?: number | null }
    const actor = currentUser(req)

    const before = await prisma.logisticsReq.findUnique({ where: { id }, select: requestView })
    if (!before) throw ApiError.notFound('Logistics request not found')

    const resolution =
      body.status === RequestStatus.RESOLVED
        ? { resolvedById: actor.id }
        : body.status !== undefined
          ? { resolvedById: null }
          : {}

    const after = await prisma.logisticsReq.update({
      where: { id },
      data: { ...body, ...resolution },
      select: requestView,
    })

    await auditRequest(req, {
      action: body.status === RequestStatus.RESOLVED ? 'RESOLVE' : 'UPDATE',
      entityType: 'LogisticsReq',
      entityId: id,
      payloadBefore: before,
      payloadAfter: after,
    })

    const mode = await readConferenceMode()
    res.json(withPriority(after, mode.state === 'RUNNING', new Date()))
  }),
)

logisticsRouter.delete(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }

    const before = await prisma.logisticsReq.findUnique({ where: { id }, select: requestView })
    if (!before) throw ApiError.notFound('Logistics request not found')

    await prisma.logisticsReq.delete({ where: { id } })

    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'LogisticsReq',
      entityId: id,
      payloadBefore: before,
    })

    res.status(204).send()
  }),
)
