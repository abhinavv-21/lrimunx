import { Router } from 'express'
import { Prisma, PriceTier, RegistrationStatus, Role } from '@prisma/client'
import { keyFromUrl, presignGet } from '../lib/storage.js'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest, recordAudit } from '../lib/audit.js'
import { registrationApprovedMail, sendMail } from '../lib/email.js'
import { runSerializable } from '../lib/transaction.js'
import { readTierPrices } from '../lib/conference.js'
import { checkReviewTransition } from '../lib/registrations.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import {
  recordPaymentSchema,
  registrationQuery,
  rejectRegistrationSchema,
  uuidParam,
} from '../schemas/index.js'

export const registrationsRouter = Router()

const PROOF_URL_TTL_MS = 10 * 60 * 1000

const registrationView = {
  id: true,
  reference: true,
  fullName: true,
  email: true,
  phone: true,
  schoolName: true,
  grade: true,
  committeePreference: true,
  committeePreference2: true,
  munsAttended: true,
  awardsWon: true,
  referralCode: true,
  paymentProofUrl: true,
  dietaryNotes: true,
  accessibilityNotes: true,
  status: true,
  priceTier: true,
  amountPaid: true,
  reviewedAt: true,
  rejectionReason: true,
  delegateId: true,
  createdAt: true,
  updatedAt: true,
  reviewedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.RegistrationSelect

const registrationOrder: Prisma.RegistrationOrderByWithRelationInput[] = [
  { status: 'asc' },
  { createdAt: 'desc' },
]

/**
 * Adds `hasPaymentProof` to a registration on the way out.
 *
 * The URL is already in the payload, but the review screen wants one row that
 * shows tier, amount and whether there is a screenshot to look at, and asking
 * it to infer the third from a nullable string it must not render is how a
 * blob URL ends up on the page. Derived rather than stored: the column is the
 * only record of the upload, so a second flag could disagree with it.
 */
function withProofFlag<T extends { paymentProofUrl: string | null }>(
  row: T,
): T & { hasPaymentProof: boolean } {
  return { ...row, hasPaymentProof: row.paymentProofUrl !== null }
}

interface RegistrationQuery {
  page: number
  pageSize: number
  search?: string
  status?: RegistrationStatus
}

registrationsRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const grouped = await prisma.registration.groupBy({ by: ['status'], _count: { _all: true } })

    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 }
    for (const row of grouped) counts[row.status] = row._count._all

    res.json({
      pending: counts.PENDING,
      approved: counts.APPROVED,
      rejected: counts.REJECTED,
      total: counts.PENDING + counts.APPROVED + counts.REJECTED,
    })
  }),
)

registrationsRouter.get(
  '/',
  validate(registrationQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as RegistrationQuery

    const where: Prisma.RegistrationWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { fullName: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
              { schoolName: { contains: q.search, mode: 'insensitive' } },
              { reference: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [items, total] = await Promise.all([
      prisma.registration.findMany({
        where,
        select: registrationView,
        orderBy: registrationOrder,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.registration.count({ where }),
    ])

    res.json({ items: items.map(withProofFlag), total, page: q.page, pageSize: q.pageSize })
  }),
)

registrationsRouter.get(
  '/:id',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const actor = currentUser(req)

    const registration = await prisma.registration.findUnique({
      where: { id },
      select: {
        ...registrationView,
        ...(actor.role === Role.ADMIN ? { submittedIp: true, userAgent: true } : {}),
        delegate: { select: { id: true, fullName: true, email: true } },
      },
    })
    if (!registration) throw ApiError.notFound('Registration not found')

    res.json(withProofFlag(registration))
  }),
)

registrationsRouter.get(
  '/:id/payment-proof',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }

    const registration = await prisma.registration.findUnique({
      where: { id },
      select: { paymentProofUrl: true },
    })
    if (!registration) throw ApiError.notFound('Registration not found')

    const stored = registration.paymentProofUrl
    if (!stored) throw ApiError.notFound('This registration has no payment screenshot')

    const key = keyFromUrl(stored)
    if (!key) {
      throw ApiError.unprocessable(
        'This screenshot was uploaded to the old store and can no longer be opened here.',
        { paymentProofUrl: stored },
      )
    }

    const validUntil = Date.now() + PROOF_URL_TTL_MS
    const presignedUrl = await presignGet(key, PROOF_URL_TTL_MS)

    res.setHeader('Cache-Control', 'no-store')
    res.json({ url: presignedUrl, expiresAt: new Date(validUntil).toISOString() })
  }),
)

registrationsRouter.post(
  '/:id/payment',
  requireAdmin,
  validate(uuidParam, 'params'),
  validate(recordPaymentSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const { priceTier, amountPaid } = req.body as { priceTier: PriceTier; amountPaid?: number }

    const before = await prisma.registration.findUnique({ where: { id }, select: registrationView })
    if (!before) throw ApiError.notFound('Registration not found')

    // The tier's configured rate is the default, not the rule. Real payments
    // arrive short, rounded, or at last year's price, and a screen that could
    // only record the list price would push the difference into a note nobody
    // adds up.
    const prices = await readTierPrices()
    const amount = amountPaid ?? prices[priceTier]

    const after = await prisma.registration.update({
      where: { id },
      data: { priceTier, amountPaid: amount },
      select: registrationView,
    })

    await auditRequest(req, {
      action: 'PAYMENT',
      entityType: 'Registration',
      entityId: id,
      payloadBefore: { priceTier: before.priceTier, amountPaid: before.amountPaid },
      payloadAfter: { priceTier, amountPaid: amount, configuredPrice: prices[priceTier] },
    })

    res.json(withProofFlag(after))
  }),
)

registrationsRouter.post(
  '/:id/approve',
  requireAdmin,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const actor = currentUser(req)

    const result = await runSerializable(async (tx) => {
      const before = await tx.registration.findUnique({ where: { id }, select: registrationView })
      if (!before) throw ApiError.notFound('Registration not found')

      const transition = checkReviewTransition(before.status, 'approve')
      if (!transition.allowed) {
        throw ApiError.conflict(transition.reason ?? 'This registration has already been reviewed', {
          status: before.status,
        })
      }

      const clash = await tx.delegate.findUnique({
        where: { email: before.email },
        select: { id: true, fullName: true, schoolName: true },
      })
      if (clash) {
        throw ApiError.conflict(
          `A delegate with ${before.email} already exists — ${clash.fullName} of ${clash.schoolName}. Resolve that record before approving this registration.`,
          { delegateId: clash.id, email: before.email },
        )
      }

      const delegate = await tx.delegate.create({
        data: {
          fullName: before.fullName,
          email: before.email,
          phone: before.phone,
          schoolName: before.schoolName,
          grade: before.grade,
          committeePreference: before.committeePreference,
          committeePreference2: before.committeePreference2,
          munsAttended: before.munsAttended,
          awardsWon: before.awardsWon,
          dietaryNotes: before.dietaryNotes,
          accessibilityNotes: before.accessibilityNotes,
        },
      })

      const after = await tx.registration.update({
        where: { id },
        data: {
          status: RegistrationStatus.APPROVED,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          delegateId: delegate.id,
          rejectionReason: null,
        },
        select: registrationView,
      })

      await recordAudit(
        {
          userId: actor.id,
          action: 'APPROVE',
          entityType: 'Registration',
          entityId: id,
          payloadBefore: before,
          payloadAfter: after,
        },
        tx,
      )

      await recordAudit(
        {
          userId: actor.id,
          action: 'CREATE',
          entityType: 'Delegate',
          entityId: delegate.id,
          payloadAfter: { ...delegate, source: 'registration', reference: before.reference },
        },
        tx,
      )

      return { registration: after, delegate }
    })

    req.auditWritten = true

    const email = await sendMail(
      registrationApprovedMail({
        fullName: result.registration.fullName,
        email: result.registration.email,
        reference: result.registration.reference,
        schoolName: result.registration.schoolName,
      }),
    )

    res.json({ ...result, registration: withProofFlag(result.registration), email })
  }),
)

registrationsRouter.post(
  '/:id/reject',
  requireAdmin,
  validate(uuidParam, 'params'),
  validate(rejectRegistrationSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const { reason } = req.body as { reason?: string | null }

    const before = await prisma.registration.findUnique({ where: { id }, select: registrationView })
    if (!before) throw ApiError.notFound('Registration not found')

    const transition = checkReviewTransition(before.status, 'reject')
    if (!transition.allowed) {
      throw ApiError.conflict(transition.reason ?? 'This registration has already been reviewed', {
        status: before.status,
      })
    }

    const after = await prisma.registration.update({
      where: { id },
      data: {
        status: RegistrationStatus.REJECTED,
        reviewedById: currentUser(req).id,
        reviewedAt: new Date(),
        rejectionReason: reason ?? null,
      },
      select: registrationView,
    })

    await auditRequest(req, {
      action: 'REJECT',
      entityType: 'Registration',
      entityId: id,
      payloadBefore: before,
      payloadAfter: after,
    })

    res.json(withProofFlag(after))
  }),
)

registrationsRouter.delete(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }

    const before = await prisma.registration.findUnique({ where: { id }, select: registrationView })
    if (!before) throw ApiError.notFound('Registration not found')

    await prisma.registration.delete({ where: { id } })

    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'Registration',
      entityId: id,
      payloadBefore: before,
    })

    res.status(204).send()
  }),
)
