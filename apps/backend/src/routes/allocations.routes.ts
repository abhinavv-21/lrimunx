import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest } from '../lib/audit.js'
import { emailEnabled } from '../lib/email.js'
import {
  BATCH_SIZE,
  countByReason,
  partitionRecipients,
  readAllocationAudience,
  sendAnnouncementBatch,
} from '../lib/announcements.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { requireOwner } from '../middleware/rbac.js'
import { readConferenceWhen } from '../lib/conference.js'
import { CONFIRMATION_PHRASE, announceAllocationsSchema } from '../schemas/index.js'

export const allocationsRouter = Router()

/**
 * Telling four hundred school students which committee they are in.
 *
 * Owner-only and behind the same typed phrase as the danger zone, for the same
 * reason: it cannot be undone. An email that has left the building is out
 * there, and the mistake this guards against is not malice but a stray click on
 * a screen the whole secretariat can reach.
 */
allocationsRouter.use(requireOwner)

allocationsRouter.get(
  '/announce/preview',
  asyncHandler(async (req, res) => {
    const requireStudyGuide = req.query['includeStudyGuide'] !== 'false'

    const [audience, when] = await Promise.all([readAllocationAudience(), readConferenceWhen()])
    const { recipients, excluded } = partitionRecipients(audience, requireStudyGuide)

    const committeesMissingGuide = [
      ...new Set(
        excluded.filter((row) => row.reason === 'NO_STUDY_GUIDE').map((row) => row.detail ?? '?'),
      ),
    ].sort()

    res.json({
      // What the operator is about to do, in one number.
      willSend: recipients.length,
      batchSize: BATCH_SIZE,
      batchesNeeded: Math.ceil(recipients.length / BATCH_SIZE),
      emailConfigured: emailEnabled,
      requireStudyGuide,
      committeesMissingGuide,
      conference: when,
      confirmationPhrase: CONFIRMATION_PHRASE,
      recipients: recipients.map((r) => ({
        delegateId: r.delegateId,
        fullName: r.fullName,
        email: r.email,
        committeeCode: r.committeeCode,
        country: r.country,
        // A retry rather than a first attempt, and why it failed last time.
        previousError: r.previousError,
        attempts: r.attempts,
      })),
      excluded,
      excludedCounts: countByReason(excluded),
    })
  }),
)

allocationsRouter.post(
  '/announce',
  validate(announceAllocationsSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      passphrase: string
      includeStudyGuide: boolean
      batchSize: number
    }

    if (body.passphrase !== CONFIRMATION_PHRASE) {
      throw new ApiError(
        403,
        `That confirmation phrase is not correct. Type ${CONFIRMATION_PHRASE} exactly. No email was sent.`,
      )
    }

    if (!emailEnabled) {
      throw new ApiError(
        503,
        'SMTP is not configured on this deployment, so no email can be sent. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM.',
      )
    }

    const [audience, when] = await Promise.all([readAllocationAudience(), readConferenceWhen()])
    const { recipients, excluded } = partitionRecipients(audience, body.includeStudyGuide)

    // Refuse rather than mail a broken link. The caller can opt out with
    // includeStudyGuide: false, which is a deliberate decision someone makes
    // once rather than a default that quietly ships a dead URL to a year group.
    if (body.includeStudyGuide) {
      const missing = [
        ...new Set(
          excluded.filter((row) => row.reason === 'NO_STUDY_GUIDE').map((row) => row.detail ?? '?'),
        ),
      ].sort()

      if (missing.length > 0) {
        throw ApiError.unprocessable(
          `No study guide is set for ${missing.join(', ')}. Add the link on each committee, or send without it.`,
          { committeesMissingGuide: missing },
        )
      }
    }

    if (recipients.length === 0) {
      res.json({
        sent: 0,
        failed: 0,
        remaining: 0,
        rateLimited: false,
        done: true,
        outcomes: [],
        excludedCounts: countByReason(excluded),
      })
      return
    }

    const result = await sendAnnouncementBatch(recipients, when, body.batchSize)

    await auditRequest(req, {
      action: 'ANNOUNCE',
      entityType: 'Allocation',
      entityId: `batch:${result.sent + result.failed}`,
      payloadAfter: {
        sent: result.sent,
        failed: result.failed,
        remaining: result.remaining,
        rateLimited: result.rateLimited,
        includeStudyGuide: body.includeStudyGuide,
      },
    })

    res.json({
      sent: result.sent,
      failed: result.failed,
      remaining: result.remaining,
      rateLimited: result.rateLimited,
      // The caller stops when this is true. It is not `remaining === 0`: a
      // batch of addresses the server keeps refusing would otherwise loop for
      // ever, so a batch that sent nothing ends the run too.
      done: result.remaining === 0 || result.sent === 0,
      outcomes: result.outcomes,
      excludedCounts: countByReason(excluded),
      ...(result.rateLimited
        ? {
            message:
              'The mail provider refused for volume, not for a bad address. Wait an hour before sending the rest — Gmail and Workspace cap a day at around 500 recipients.',
          }
        : {}),
    })
  }),
)

/**
 * Clears the record for delegates whose send failed, so a fixed address can be
 * tried again from scratch. Never touches a SENT row: that is the guard against
 * a duplicate mailshot and nothing here is allowed to lift it.
 */
allocationsRouter.post(
  '/announce/reset-failures',
  asyncHandler(async (req, res) => {
    const removed = await prisma.allocationAnnouncement.deleteMany({ where: { status: 'FAILED' } })

    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'AllocationAnnouncement',
      entityId: `failed:${removed.count}`,
      payloadBefore: { failed: removed.count },
    })

    res.json({ cleared: removed.count })
  }),
)
