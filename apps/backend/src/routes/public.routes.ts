import { Router, type NextFunction, type Request, type Response } from 'express'
import { randomInt } from 'node:crypto'
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
/** Roughly the cost of the real path, so the trap is not faster than a submission. */
const HONEYPOT_DELAY_MS = 8
const HONEYPOT_JITTER_MS = 6

/**
 * The client address, preferring the one the platform vouches for.
 *
 * `req.ip` derives from X-Forwarded-For under `trust proxy`, and that header is
 * attacker-supplied: rotating it gives a flood a fresh rate-limit bucket every
 * request and writes a forged value into `submittedIp`, which is the field the
 * hub shows an admin for abuse review. Vercel sets `x-vercel-forwarded-for`
 * itself and a client cannot override it, so it wins where it exists.
 */
function clientAddress(req: Request): string {
  const vouched = req.header('x-vercel-forwarded-for')
  return (vouched?.split(',')[0] ?? '').trim() || req.ip || 'unknown'
}

const limiterOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientAddress,
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
async function honeypotGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const body = req.body as Record<string, unknown> | undefined
  const trap = body?.['hp_website']

  // Absent or an empty string is a human. Anything else — including a number
  // or an object, which previously fell through to a 422 that named the field
  // by name — is the trap being touched.
  const tripped = trap !== undefined && (typeof trap !== 'string' || isHoneypotTripped(trap))

  if (!tripped) {
    next()
    return
  }

  // The gate answers before touching the database, which made it measurably
  // faster than a genuine submission — a few milliseconds, consistently, which
  // is all a script needs to tell the two apart. Sleep for roughly what the
  // real path costs, jittered so the delay itself is not a signature.
  await new Promise((resolve) => setTimeout(resolve, HONEYPOT_DELAY_MS + randomInt(0, HONEYPOT_JITTER_MS)))

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
      // Same address the rate limiter keys on — see clientAddress. Storing
      // req.ip here would record whatever the submitter put in X-Forwarded-For,
      // which is the opposite of useful on a field labelled "for abuse review".
      submittedIp: clientAddress(req),
      userAgent: req.header('user-agent')?.slice(0, USER_AGENT_MAX) ?? null,
    })

    /*
      One response for both outcomes, deliberately.

      A 201/200 split answered "has this person applied to LRI MUN X?" for
      anyone holding a school email list — the caller had proven nothing and
      the status code alone was the oracle. Now a duplicate is indistinguishable
      from a first submission: submit a stranger's address twice and you get the
      same reference back both times whether or not it was already there, so the
      response tells you nothing you did not already supply.

      The reference still comes back because it is the only way an applicant
      receives it — there is no outbound email — and a genuine re-submitter gets
      the code that is actually on their row rather than a fabricated one.
      Nothing else about an existing application is disclosed: not the name on
      it, not its status, not who reviewed it.
    */
    const body: PublicRegistrationAccepted = { status: 'received', reference: outcome.reference }
    res.status(201).json(body)
  }),
)
