import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest } from '../lib/audit.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin, requireUserManager } from '../middleware/rbac.js'
import { createUserSchema, paginationQuery, updateUserSchema, uuidParam } from '../schemas/index.js'
import type { PaginationQuery } from '../schemas/index.js'

export const usersRouter = Router()

/*
  Two gates, and both matter.

  ADMIN first, so a contributor still gets the same 403 they always did and the
  role boundary is unchanged. Then the account-management flag, which is
  narrower: running the conference and deciding who can sign in are different
  powers, and most admins only need the first.

  Applied to the whole router rather than per route, so a handler added later
  is covered by default instead of by remembering.
*/
usersRouter.use(requireAdmin, requireUserManager)

const publicFields = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  canManageUsers: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect

usersRouter.get(
  '/',
  validate(paginationQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, search } = req.query as unknown as PaginationQuery

    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: publicFields,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ])

    res.json({ items, total, page, pageSize })
  }),
)

usersRouter.post(
  '/',
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const { password, ...rest } = req.body as { password: string; username: string; fullName: string; role: 'ADMIN' | 'CONTRIBUTOR' }

    const user = await prisma.user.create({
      data: { ...rest, passwordHash: await bcrypt.hash(password, 12) },
      select: publicFields,
    })

    await auditRequest(req, {
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      payloadAfter: user,
    })

    res.status(201).json(user)
  }),
)

usersRouter.patch(
  '/:id',
  validate(uuidParam, 'params'),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const actor = currentUser(req)
    const { password, ...rest } = req.body as {
      password?: string
      fullName?: string
      role?: 'ADMIN' | 'CONTRIBUTOR'
      canManageUsers?: boolean
    }

    const before = await prisma.user.findUnique({ where: { id }, select: publicFields })
    if (!before) throw ApiError.notFound('User not found')

    // Guard against an admin locking the secretariat out of its own console.
    if (rest.role === 'CONTRIBUTOR' && before.role === 'ADMIN') {
      if (actor.id === id) throw ApiError.badRequest('You cannot remove your own admin role')
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) throw ApiError.conflict('At least one admin account must remain')
    }

    /*
      The same lockout guard as the admin role, for the same reason.

      Only somebody who can manage accounts can revoke the ability to manage
      accounts — so once the last holder gives it up, nobody can grant it back
      through the hub, and the only fix is SQL. Refusing here is cheaper than
      that conversation.
    */
    if (rest.canManageUsers === false && before.canManageUsers) {
      const holders = await prisma.user.count({ where: { canManageUsers: true } })
      if (holders <= 1) {
        throw ApiError.conflict(
          'At least one account must be able to manage users, or nobody can grant it back.',
        )
      }
    }

    const after = await prisma.user.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
      select: publicFields,
    })

    await auditRequest(req, {
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      payloadBefore: before,
      payloadAfter: { ...after, ...(password ? { passwordHash: '[redacted]' } : {}) },
    })

    res.json(after)
  }),
)

usersRouter.delete(
  '/:id',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const actor = currentUser(req)

    if (actor.id === id) throw ApiError.badRequest('You cannot delete your own account')

    const before = await prisma.user.findUnique({ where: { id }, select: publicFields })
    if (!before) throw ApiError.notFound('User not found')

    if (before.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) throw ApiError.conflict('At least one admin account must remain')
    }

    // Deleting the last account that can manage users leaves the hub with no
    // way to create another one. See the same guard on PATCH.
    if (before.canManageUsers) {
      const holders = await prisma.user.count({ where: { canManageUsers: true } })
      if (holders <= 1) {
        throw ApiError.conflict(
          'At least one account must be able to manage users, or nobody can grant it back.',
        )
      }
    }

    // AuditLog.userId and the LogisticsReq relations are restrict-by-default,
    // so surface a clear conflict rather than a raw foreign-key error.
    const [authored, resolved, audits] = await Promise.all([
      prisma.logisticsReq.count({ where: { createdById: id } }),
      prisma.logisticsReq.count({ where: { resolvedById: id } }),
      prisma.auditLog.count({ where: { userId: id } }),
    ])
    if (authored + resolved + audits > 0) {
      throw ApiError.conflict(
        'This account has activity history and cannot be deleted. Change its role to CONTRIBUTOR instead.',
        { logisticsRequests: authored + resolved, auditEntries: audits },
      )
    }

    await prisma.user.delete({ where: { id } })

    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'User',
      entityId: id,
      payloadBefore: before,
    })

    res.status(204).send()
  }),
)
