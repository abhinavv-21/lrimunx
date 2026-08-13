import { Router } from 'express'
import { Prisma, RequestCategory, RequestStatus, Role } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest } from '../lib/audit.js'
import { notifyAdmins } from '../lib/push.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import { createLogisticsSchema, logisticsQuery, updateLogisticsSchema, uuidParam } from '../schemas/index.js'

export const logisticsRouter = Router()

const HIGH_PRIORITY = new Set<RequestCategory>([RequestCategory.PLACARD, RequestCategory.LOGISTICS])

const DEDUPE_WINDOW_MS = 15 * 60_000

const requestView = {
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
} satisfies Prisma.LogisticsReqSelect

type LogisticsQuery = {
  page: number
  pageSize: number
  search?: string
  sortDir: 'asc' | 'desc'
  status?: RequestStatus
  category?: RequestCategory
  committeeId?: string
  mine?: boolean
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

    res.json({ items, total, page: q.page, pageSize: q.pageSize })
  }),
)

logisticsRouter.get(
  '/:id',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const request = await prisma.logisticsReq.findUnique({ where: { id }, select: requestView })
    if (!request) throw ApiError.notFound('Logistics request not found')
    res.json(request)
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
    }
    const actor = currentUser(req)
    const committeeId = body.committeeId ?? null

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
        createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
      },
      select: requestView,
    })

    if (duplicate) {
      res.status(200).json({ ...duplicate, deduplicated: true })
      return
    }

    const created = await prisma.logisticsReq.create({
      data: {
        title: body.title,
        category: body.category,
        description: body.description,
        committeeId,
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

    const priority = HIGH_PRIORITY.has(body.category) ? 'High priority' : 'New request'
    void notifyAdmins({
      title: `${priority}: ${created.committee?.code ?? 'General'}`,
      body: created.title,
      url: `/logistics/${created.id}`,
      tag: `logistics-${created.id}`,
    }).catch((error) => console.warn('[push] logistics alert failed:', error))

    res.status(201).json(created)
  }),
)

logisticsRouter.patch(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  validate(updateLogisticsSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const body = req.body as { status?: RequestStatus; committeeId?: string | null }
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

    res.json(after)
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
