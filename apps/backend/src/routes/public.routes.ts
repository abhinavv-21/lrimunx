import { Router, type NextFunction, type Request, type Response } from 'express'
import { randomInt } from 'node:crypto'
import { Prisma } from '@prisma/client'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import {
  ALLOWED_UPLOAD_TYPES,
  newUploadKey,
  presignPut,
  storageEnabled,
} from '../lib/storage.js'
import { ApiError, type ApiErrorBody } from '../lib/errors.js'
import { runSerializable } from '../lib/transaction.js'
import { normaliseReferralCode } from '../lib/referrals.js'
import {
  LIVE_REGISTRATION_STATUSES,
  generateReference,
  isHoneypotTripped,
} from '../lib/registrations.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { publicRegistrationSchema, type PublicRegistrationInput } from '../schemas/index.js'

export const publicRouter = Router()

export interface PublicRegistrationAccepted {
  status: 'received'
  reference: string
}

const BURST_WINDOW_MS = 15 * 60_000
const BURST_LIMIT = 5
const SUSTAINED_WINDOW_MS = 60 * 60_000
const SUSTAINED_LIMIT = 20

const HONEYPOT_DELAY_MS = 8
const HONEYPOT_JITTER_MS = 6

function clientAddress(req: Request): string {
  return req.ip || 'unknown'
}

const limiterOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientAddress,
  message: { error: 'Too many registration attempts. Try again later.', code: 429 },
} as const

const burstLimiter = rateLimit({ ...limiterOptions, windowMs: BURST_WINDOW_MS, limit: BURST_LIMIT })
const sustainedLimiter = rateLimit({ ...limiterOptions, windowMs: SUSTAINED_WINDOW_MS, limit: SUSTAINED_LIMIT })

const BLOB_BURST_LIMIT = 10

const blobLimiter = rateLimit({
  ...limiterOptions,
  windowMs: BURST_WINDOW_MS,
  limit: BLOB_BURST_LIMIT,
  message: { error: 'Too many upload attempts. Try again later.', code: 429 },
})

async function honeypotGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const body = req.body as Record<string, unknown> | undefined
  const trap = body?.['hp_website']

  const tripped = trap !== undefined && (typeof trap !== 'string' || isHoneypotTripped(trap))

  if (!tripped) {
    next()
    return
  }

  await new Promise((resolve) => setTimeout(resolve, HONEYPOT_DELAY_MS + randomInt(0, HONEYPOT_JITTER_MS)))

  const accepted: PublicRegistrationAccepted = { status: 'received', reference: generateReference() }
  res.status(201).json(accepted)
}

type SubmissionOutcome =
  | { kind: 'created'; reference: string }
  | { kind: 'duplicate'; reference: string }

interface SubmissionMeta {
  submittedIp: string | null
  userAgent: string | null
}

const MAX_REFERENCE_ATTEMPTS = 5

function isReferenceCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false
  const target = error.meta?.['target']
  const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : []
  return fields.some((field) => typeof field === 'string' && field.includes('reference'))
}

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

        /**
         * Match what they typed to a code, if it is one.
         *
         * Only active codes match. A retired code keeps the registrations that
         * already used it and stops collecting new ones, which is the whole
         * reason it is deactivated rather than deleted.
         *
         * A miss is not an error: the applicant may have invented it, mistyped
         * it, or used a code the secretariat has not created yet. The typed
         * text is stored either way, and creating the code later adopts them.
         */
        const referralKey = normaliseReferralCode(input.referralCode)
        const matched =
          referralKey === null
            ? null
            : await tx.referralCode.findFirst({
                where: { matchKey: referralKey, active: true },
                select: { id: true },
              })

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
            referralCodeId: matched?.id ?? null,
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

const USER_AGENT_MAX = 400

publicRouter.post(
  '/register',
  burstLimiter,
  sustainedLimiter,
  honeypotGate,
  validate(publicRegistrationSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as PublicRegistrationInput

    const outcome = await submitRegistration(input, {
      submittedIp: clientAddress(req),
      userAgent: req.header('user-agent')?.slice(0, USER_AGENT_MAX) ?? null,
    })

    const body: PublicRegistrationAccepted = { status: 'received', reference: outcome.reference }
    res.status(201).json(body)
  }),
)

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

const uploadRequestSchema = z.object({
  contentType: z.enum(ALLOWED_UPLOAD_TYPES),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
})

publicRouter.post(
  '/blob-upload',
  blobLimiter,
  asyncHandler(async (req, res) => {
    if (!storageEnabled) {
      const unavailable: ApiErrorBody = {
        error: 'Screenshot uploads are not available on this server',
        code: 503,
      }
      res.status(503).json(unavailable)
      return
    }

    const parsed = uploadRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw ApiError.badRequest('That file cannot be accepted', {
        allowedTypes: ALLOWED_UPLOAD_TYPES,
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
      })
    }

    const { contentType } = parsed.data
    const key = newUploadKey(contentType)

    res.json(await presignPut(key, contentType))
  }),
)
