import { Router } from 'express'
import { Prisma, RegistrationStatus, Role } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest, recordAudit } from '../lib/audit.js'
import { runSerializable } from '../lib/transaction.js'
import { checkReviewTransition } from '../lib/registrations.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import { registrationQuery, rejectRegistrationSchema, uuidParam } from '../schemas/index.js'

/**
 * The OC's review queue for applications submitted on the public website.
 *
 * Reading is open to both roles — a contributor staffing the registration desk
 * needs to see who applied. Every decision is ADMIN-only and audited, because
 * approving is what mints a Delegate.
 */
export const registrationsRouter = Router()

/** What a review screen needs. Never includes submittedIp/userAgent — see below. */
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
  reviewedAt: true,
  rejectionReason: true,
  delegateId: true,
  createdAt: true,
  updatedAt: true,
  reviewedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.RegistrationSelect

/**
 * PENDING first, then newest.
 *
 * The enum is declared PENDING, APPROVED, REJECTED, and Postgres sorts an enum
 * by declaration order — so ascending status puts the queue that needs work at
 * the top without a CASE expression.
 */
const registrationOrder: Prisma.RegistrationOrderByWithRelationInput[] = [
  { status: 'asc' },
  { createdAt: 'desc' },
]

interface RegistrationQuery {
  page: number
  pageSize: number
  search?: string
  status?: RegistrationStatus
}

/* --------------------------------- Reads ---------------------------------- */

/**
 * Mounted ahead of /:id so the literal path wins. The uuid guard on /:id would
 * reject "stats" anyway, but relying on that is relying on an accident.
 */
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
              // An applicant chasing their application quotes the reference and
              // nothing else, so the desk has to be able to search on it.
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

    res.json({ items, total, page: q.page, pageSize: q.pageSize })
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
        // Submission metadata is for abuse review, not for the review desk. It
        // is an IP address belonging to a member of the public, so only the
        // role that can act on abuse gets to see it.
        ...(actor.role === Role.ADMIN ? { submittedIp: true, userAgent: true } : {}),
        delegate: { select: { id: true, fullName: true, email: true } },
      },
    })
    if (!registration) throw ApiError.notFound('Registration not found')

    res.json(registration)
  }),
)

/* -------------------------------- Decisions ------------------------------- */
// ADMIN-only from here down.

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

      // Delegate.email is unique, so this would fail at the constraint anyway.
      // Catching it here names the record standing in the way instead of
      // returning a generic conflict, and rules out ever overwriting someone.
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

      /**
       * Committee and country are not set here, exactly as the CSV importer
       * leaves them unset. A committee preference is what the applicant asked
       * for; a placement is a decision the secretariat takes on the Allocations
       * screen, and inventing one at approval time would quietly consume a seat
       * nobody agreed to give away.
       *
       * Both preferences and the experience figures do come across, because
       * they are what Allocations reads when it makes that decision. The
       * referral answer and the payment screenshot stay on the Registration —
       * they are facts about an application, not about a person, and the
       * application remains linked for anyone who needs them.
       */
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

      // A second row against the Delegate, so the delegate's own activity panel
      // shows where they came from rather than a record with no origin.
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
    res.json(result)
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

    res.json(after)
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

    // Deleting an approved application drops the link, not the delegate. Once
    // someone is on the delegate list they are a conference record in their own
    // right, and removing them is a delegate decision made on that screen.
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
