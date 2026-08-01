import { Router, type NextFunction, type Request, type Response } from 'express'
import { randomInt } from 'node:crypto'
import { Prisma } from '@prisma/client'
import rateLimit from 'express-rate-limit'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { ApiError, type ApiErrorBody } from '../lib/errors.js'
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

/**
 * The only body this route returns — to a genuine submission, to a repeat
 * submission, and to a caught bot alike.
 *
 * There is deliberately no second shape. A `200 {status:'duplicate'}` used to
 * exist here, and it answered "has this person applied to LRI MUN X?" for
 * anyone holding a school email list. Reintroducing a distinguishable response
 * reintroduces that leak, so the type system offers nowhere to put one.
 */
export interface PublicRegistrationAccepted {
  status: 'received'
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
 * Its own budget, because a token request is not a submission.
 *
 * Ten in a quarter of an hour sits above the five submissions the same window
 * allows: one screenshot per application plus room to retry a photo that came
 * out unreadable, or to change one's mind about which receipt to send. Any
 * higher and this becomes free, anonymous file hosting on the conference's
 * blob store.
 */
const BLOB_BURST_LIMIT = 10

const blobLimiter = rateLimit({
  ...limiterOptions,
  windowMs: BURST_WINDOW_MS,
  limit: BLOB_BURST_LIMIT,
  message: { error: 'Too many upload attempts. Try again later.', code: 429 },
  /*
    The completion callback is Vercel Blob calling us, not a visitor uploading.
    Every callback for the whole conference arrives from the blob service's own
    addresses, so counting them against a per-IP budget would start rejecting
    them during exactly the rush the limit exists for — and a rejected callback
    is retried, not dropped, so the cost is repeated for nothing.

    Skipping it is safe because that branch is not a way to obtain anything:
    handleUpload verifies an HMAC over the body, computed with the store's
    read-write token, before it will do any work at all. A forged callback is
    refused, and the global 300/min limiter still covers the flood case.
  */
  skip: (req) => (req.body as { type?: unknown } | undefined)?.type === 'blob.upload-completed',
})

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
            committeePreference2: input.committeePreference2 ?? null,
            munsAttended: input.munsAttended ?? null,
            awardsWon: input.awardsWon ?? null,
            referralCode: input.referralCode ?? null,
            paymentProofUrl: input.paymentProofUrl ?? null,
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

/* ---------------------------- Payment screenshot -------------------------- */

/**
 * Image types a phone camera or a banking app actually produces. Anything
 * outside this list — a PDF, an SVG with script in it, an executable renamed
 * to .png — is refused by the blob store itself, because the content type is
 * baked into the signed token rather than checked here.
 */
const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** A screenshot of a payment confirmation. Generous for a photo, mean for a video. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** The two envelopes the Vercel Blob client protocol defines. */
const BLOB_EVENT_TYPES: ReadonlySet<string> = new Set([
  'blob.generate-client-token',
  'blob.upload-completed',
])

/**
 * BlobError carries no distinguishing class or `name` — it is a plain Error
 * subclass — so its own prefix is the only thing separating "the caller sent
 * nonsense" from "something under us broke".
 */
const BLOB_ERROR_PREFIX = 'Vercel Blob: '

function isHandleUploadBody(body: unknown): body is HandleUploadBody {
  const type = (body as { type?: unknown } | null | undefined)?.type
  return typeof type === 'string' && BLOB_EVENT_TYPES.has(type)
}

/**
 * POST /api/v1/public/blob-upload
 *
 * Issues a short-lived, single-purpose token so the browser can put the payment
 * screenshot into Vercel Blob directly. The file never passes through this
 * function, which is the point: a serverless function body caps at 4.5 MB, and
 * a photo off a modern phone clears that on its own.
 *
 * That makes it an open upload endpoint on a public site, so everything it
 * grants is bounded in the token — content type, size, and a random suffix so
 * one visitor cannot overwrite another's file by guessing a path.
 *
 * Not audited, for the same reason /register is not: there is no actor.
 */
publicRouter.post(
  '/blob-upload',
  blobLimiter,
  asyncHandler(async (req, res) => {
    if (!env.blobUploadsEnabled) {
      /*
        Answered here rather than thrown, deliberately.

        Local development has no blob store, and that is a supported state, not
        a fault: the form still works, the applicant simply attaches nothing.
        Sending it through the error handler would treat a 5xx as an
        unanticipated exception — logging a stack on every attempt, and, on a
        deployment that has opted into EXPOSE_ERROR_DETAILS, attaching that
        stack to the response. Both would tell a member of the public that the
        site is broken when nothing is wrong with it.
      */
      const unavailable: ApiErrorBody = {
        error: 'Screenshot uploads are not available on this server',
        code: 503,
      }
      res.status(503).json(unavailable)
      return
    }

    const body: unknown = req.body
    if (!isHandleUploadBody(body)) {
      throw ApiError.badRequest('Unrecognised upload request')
    }

    try {
      const result = await handleUpload({
        request: req,
        body,
        token: env.BLOB_READ_WRITE_TOKEN,
        onBeforeGenerateToken: async () => ({
          allowedContentTypes: [...ALLOWED_UPLOAD_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          // Two applicants both uploading "payment.jpg" must not collide, and a
          // guessable path would let anyone overwrite someone else's proof.
          addRandomSuffix: true,
        }),
        /**
         * Nothing to do: the URL reaches us on the registration payload, which
         * is the only place it is meaningful. This exists to satisfy the
         * protocol and, above all, to never throw — the blob service treats a
         * failed callback as retryable and will keep calling back, so an
         * exception over a payload we did not expect turns one odd upload into
         * a repeating one.
         */
        onUploadCompleted: async () => {
          /* deliberately empty */
        },
      })

      res.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      // A refused signature or a malformed payload is the caller's problem and
      // gets a 400. Anything else is ours, and is left to the error handler so
      // it is logged as the 500 it is rather than disguised as bad input.
      if (message.startsWith(BLOB_ERROR_PREFIX)) {
        throw ApiError.badRequest('Upload request was rejected')
      }
      throw error
    }
  }),
)
