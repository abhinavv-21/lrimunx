import { Router, type NextFunction, type Request, type Response } from 'express'
import { Prisma } from '@prisma/client'
import rateLimit from 'express-rate-limit'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { runSerializable } from '../lib/transaction.js'
import {
  LIVE_REGISTRATION_STATUSES,
  generateReference,
  isHoneypotTripped,
} from '../lib/registrations.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { publicRegistrationSchema, type PublicRegistrationInput } from '../schemas/index.js'

/**
 * The only unauthenticated write in the API.
 *
 * A submission here creates a Registration and nothing else. It cannot create
 * a User, and it cannot create a Delegate — approval by an ADMIN does that,
 * over on /registrations. Nobody registers their way into the ops hub.
 */
export const publicRouter = Router()

/** 201 body, returned to a genuine submission and to a caught bot alike. */
export interface PublicRegistrationAccepted {
  status: 'received'
  reference: string
}

/** 200 body when this email already has a live application. */
export interface PublicRegistrationDuplicate {
  status: 'duplicate'
  reference: string
}

/* ------------------------------ Abuse limits ------------------------------ */

/**
 * Far below the global 300/min, because this route is reachable by anyone.
 *
 * The busiest legitimate pattern is a teacher registering a delegation one
 * student at a time from a single school IP. Five in a quarter of an hour is a
 * comfortable ceiling on that — filling this form honestly takes a minute or
 * two — and twenty an hour lets a whole delegation through across a sitting
 * while still costing a scripted flood four rejections in five.
 */
const BURST_WINDOW_MS = 15 * 60_000
const BURST_LIMIT = 5
const SUSTAINED_WINDOW_MS = 60 * 60_000
const SUSTAINED_LIMIT = 20

/**
 * The store is per-instance. On Vercel that means the effective ceiling is
 * these numbers multiplied by however many instances are warm, so treat this
 * as friction rather than as a hard cap — the honeypot and the duplicate check
 * are what actually keep the table clean.
 */
const limiterOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Try again later.', code: 429 },
} as const

const burstLimiter = rateLimit({ ...limiterOptions, windowMs: BURST_WINDOW_MS, limit: BURST_LIMIT })
const sustainedLimiter = rateLimit({ ...limiterOptions, windowMs: SUSTAINED_WINDOW_MS, limit: SUSTAINED_LIMIT })

/**
 * Answers a filled honeypot with the success a real submission gets, including
 * a well-formed reference that matches nothing in the database.
 *
 * It runs before validation so a bot never sees a field-level 422 either — the
 * two responses a scripted submitter can distinguish are "accepted" and "rate
 * limited", and neither of them says why.
 */
function honeypotGate(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as Record<string, unknown> | undefined
  const trap = body?.['hp_website']

  if (!isHoneypotTripped(typeof trap === 'string' ? trap : null)) {
    next()
    return
  }

  const accepted: PublicRegistrationAccepted = { status: 'received', reference: generateReference() }
  res.status(201).json(accepted)
}

/* ------------------------------- Submission ------------------------------- */

type SubmissionOutcome =
  | { kind: 'created'; reference: string }
  | { kind: 'duplicate'; reference: string }

interface SubmissionMeta {
  submittedIp: string | null
  userAgent: string | null
}

/** 32^6 references. Five attempts is already far past the point of paranoia. */
const MAX_REFERENCE_ATTEMPTS = 5

function isReferenceCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false
  const target = error.meta?.['target']
  const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : []
  return fields.some((field) => typeof field === 'string' && field.includes('reference'))
}

/**
 * Looks for a live application and creates one if there is none, in a single
 * serializable transaction so a double-submitted form cannot slip two PENDING
 * rows past the check.
 */
async function submitRegistration(
  input: PublicRegistrationInput,
  meta: SubmissionMeta,
): Promise<SubmissionOutcome> {
  for (let attempt = 1; attempt <= MAX_REFERENCE_ATTEMPTS; attempt++) {
    try {
      return await runSerializable<SubmissionOutcome>(async (tx) => {
        const existing = await tx.registration.findFirst({
          where: { email: input.email, status: { in: [...LIVE_REGISTRATION_STATUSES] } },
          orderBy: { createdAt: 'desc' },
          select: { reference: true },
        })
        if (existing) return { kind: 'duplicate', reference: existing.reference }

        const created = await tx.registration.create({
          data: {
            reference: generateReference(),
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            schoolName: input.schoolName,
            grade: input.grade,
            committeePreference: input.committeePreference ?? null,
            dietaryNotes: input.dietaryNotes ?? null,
            accessibilityNotes: input.accessibilityNotes ?? null,
            submittedIp: meta.submittedIp,
            userAgent: meta.userAgent,
          },
          select: { reference: true },
        })

        return { kind: 'created', reference: created.reference }
      })
    } catch (error) {
      if (isReferenceCollision(error) && attempt < MAX_REFERENCE_ATTEMPTS) continue
      throw error
    }
  }

  throw ApiError.internal('Could not allocate a registration reference')
}

/** A pathological User-Agent must not become a megabyte of stored text. */
const USER_AGENT_MAX = 400

/**
 * POST /api/v1/public/register
 *
 * Deliberately not audited. AuditLog rows attribute an action to a User, and
 * there is no actor here — the Registration row is itself the record of what
 * arrived, from which address, at what time.
 */
publicRouter.post(
  '/register',
  burstLimiter,
  sustainedLimiter,
  honeypotGate,
  validate(publicRegistrationSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as PublicRegistrationInput

    const outcome = await submitRegistration(input, {
      // `trust proxy` is set on the app, so req.ip is the client address rather
      // than the load balancer's.
      submittedIp: req.ip ?? null,
      userAgent: req.header('user-agent')?.slice(0, USER_AGENT_MAX) ?? null,
    })

    if (outcome.kind === 'duplicate') {
      // Only their own reference comes back. Nothing else about the existing
      // application is disclosed to an unauthenticated caller — not the name on
      // it, not its status, not who reviewed it.
      const body: PublicRegistrationDuplicate = { status: 'duplicate', reference: outcome.reference }
      res.status(200).json(body)
      return
    }

    const body: PublicRegistrationAccepted = { status: 'received', reference: outcome.reference }
    res.status(201).json(body)
  }),
)
