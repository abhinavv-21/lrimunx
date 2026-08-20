import { AnnouncementStatus, Prisma } from '@prisma/client'
import { prisma } from './prisma.js'
import { allocationAnnouncedMail, isRateLimitFailure, sendMail } from './email.js'

/**
 * The bulk allocation announcement: one email per allocated delegate telling
 * them their committee, their country and where the study guide is.
 *
 * Three constraints shape all of this.
 *
 * It is CHUNKED because the first deployment target caps a request at thirty
 * seconds and four hundred messages over SMTP will not finish in one. A call
 * sends at most BATCH_SIZE and reports what is left, and the operator's screen
 * calls again until `remaining` is zero. There is no background worker on
 * purpose — the deployment is one Node process and nothing else.
 *
 * It is IDEMPOTENT because a duplicate mailshot to four hundred school students
 * cannot be taken back. A SENT row on AllocationAnnouncement excludes a
 * delegate permanently, so pressing the button again is safe and resuming after
 * a timeout is simply the normal way it finishes.
 *
 * It TOLERATES PARTIAL FAILURE because SMTP always rejects a few school
 * addresses. A failure is written down with its reason and the batch carries
 * on; a later call picks the failures back up, because they are still not SENT.
 */

/**
 * Twenty-five messages plus the gap between them lands around eight seconds
 * against a normal SMTP host, which leaves the thirty-second cap a wide margin
 * for a slow one.
 */
export const BATCH_SIZE = 25

/**
 * A pause between messages. Gmail and Workspace throttle bursts before they
 * refuse them outright, and 120ms is slow enough to stay under that while
 * costing a full batch only three seconds.
 */
export const SEND_GAP_MS = 120

export type ExclusionReason = 'NO_ALLOCATION' | 'NO_EMAIL' | 'ALREADY_SENT' | 'NO_STUDY_GUIDE'

export interface Recipient {
  delegateId: string
  fullName: string
  email: string
  committeeId: string
  committeeCode: string
  committeeName: string
  country: string
  studyGuideUrl: string | null
  /** Set when this delegate has been tried before and failed. */
  previousError: string | null
  attempts: number
}

export interface Excluded {
  delegateId: string
  fullName: string
  reason: ExclusionReason
  detail?: string
}

const allocatedDelegate = {
  id: true,
  fullName: true,
  email: true,
  assignment: {
    select: {
      country: true,
      committee: { select: { id: true, code: true, name: true, studyGuideUrl: true } },
    },
  },
  announcement: { select: { status: true, error: true, attempts: true } },
} satisfies Prisma.DelegateSelect

type AllocatedDelegate = Prisma.DelegateGetPayload<{ select: typeof allocatedDelegate }>

/**
 * Splits the delegates into who gets an email and who does not, with a reason
 * for every exclusion.
 *
 * The reason is the whole value of this: "382 of 400" tells an operator nothing
 * they can act on, and "11 have no allocation, 4 have no committee study guide"
 * tells them exactly what to go and fix.
 */
export function partitionRecipients(
  delegates: AllocatedDelegate[],
  requireStudyGuide: boolean,
): { recipients: Recipient[]; excluded: Excluded[] } {
  const recipients: Recipient[] = []
  const excluded: Excluded[] = []

  for (const delegate of delegates) {
    const base = { delegateId: delegate.id, fullName: delegate.fullName }

    if (!delegate.assignment) {
      excluded.push({ ...base, reason: 'NO_ALLOCATION' })
      continue
    }
    if (delegate.email.trim() === '') {
      excluded.push({ ...base, reason: 'NO_EMAIL' })
      continue
    }
    if (delegate.announcement?.status === AnnouncementStatus.SENT) {
      excluded.push({ ...base, reason: 'ALREADY_SENT' })
      continue
    }

    const committee = delegate.assignment.committee

    if (requireStudyGuide && !committee.studyGuideUrl) {
      excluded.push({ ...base, reason: 'NO_STUDY_GUIDE', detail: committee.code })
      continue
    }

    recipients.push({
      delegateId: delegate.id,
      fullName: delegate.fullName,
      email: delegate.email,
      committeeId: committee.id,
      committeeCode: committee.code,
      committeeName: committee.name,
      country: delegate.assignment.country,
      studyGuideUrl: committee.studyGuideUrl,
      previousError: delegate.announcement?.error ?? null,
      attempts: delegate.announcement?.attempts ?? 0,
    })
  }

  return { recipients, excluded }
}

export function countByReason(excluded: Excluded[]): Record<ExclusionReason, number> {
  const counts: Record<ExclusionReason, number> = {
    NO_ALLOCATION: 0,
    NO_EMAIL: 0,
    ALREADY_SENT: 0,
    NO_STUDY_GUIDE: 0,
  }
  for (const row of excluded) counts[row.reason] += 1
  return counts
}

/**
 * Everyone who has been approved into a delegate, with whatever is known about
 * their allocation and whether they have been mailed.
 *
 * One query with the two relations attached rather than a query per delegate.
 * The whole conference is a few hundred rows and the caller needs the counts
 * for every exclusion reason, so there is nothing here to paginate.
 */
export async function readAllocationAudience(): Promise<AllocatedDelegate[]> {
  return prisma.delegate.findMany({
    orderBy: [{ fullName: 'asc' }],
    select: allocatedDelegate,
  })
}

export interface SendOutcome {
  delegateId: string
  fullName: string
  email: string
  sent: boolean
  error?: string
}

export interface BatchResult {
  sent: number
  failed: number
  /** Still waiting after this batch, which is what the caller loops on. */
  remaining: number
  /** True when the provider refused for volume rather than for a bad address. */
  rateLimited: boolean
  skipped: boolean
  outcomes: SendOutcome[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface ConferenceWhen {
  startsOn: string | null
  endsOn: string | null
  venue: string | null
}

/**
 * Mails one batch and writes down what happened to each delegate.
 *
 * The record is written per message, not once at the end. If the request is
 * killed halfway — which on a thirty-second cap is a normal outcome, not an
 * exceptional one — everyone already mailed is already marked SENT, so the
 * retry does not mail them again.
 *
 * Stops early on a rate limit. Carrying on after the provider has said "too
 * many" only converts the rest of the batch into failures and pushes the
 * account closer to a block.
 */
export async function sendAnnouncementBatch(
  recipients: Recipient[],
  when: ConferenceWhen,
  limit: number = BATCH_SIZE,
  gapMs: number = SEND_GAP_MS,
): Promise<BatchResult> {
  const batch = recipients.slice(0, limit)
  const outcomes: SendOutcome[] = []

  let sent = 0
  let failed = 0
  let rateLimited = false
  let skipped = false

  for (const [index, recipient] of batch.entries()) {
    if (index > 0 && gapMs > 0) await sleep(gapMs)

    const result = await sendMail(
      allocationAnnouncedMail({
        fullName: recipient.fullName,
        email: recipient.email,
        committeeName: recipient.committeeName,
        committeeCode: recipient.committeeCode,
        country: recipient.country,
        studyGuideUrl: recipient.studyGuideUrl,
        startsOn: when.startsOn,
        endsOn: when.endsOn,
        venue: when.venue,
      }),
    )

    // SMTP is not configured at all. Nothing was sent and nothing is recorded,
    // because writing SENT here would permanently exclude a delegate who never
    // received anything.
    if (result.skipped) {
      skipped = true
      break
    }

    const attempts = recipient.attempts + 1

    if (result.sent) {
      sent += 1
      outcomes.push({
        delegateId: recipient.delegateId,
        fullName: recipient.fullName,
        email: recipient.email,
        sent: true,
      })
      await prisma.allocationAnnouncement.upsert({
        where: { delegateId: recipient.delegateId },
        update: { status: AnnouncementStatus.SENT, error: null, attempts, sentAt: new Date() },
        create: {
          delegateId: recipient.delegateId,
          status: AnnouncementStatus.SENT,
          attempts,
          sentAt: new Date(),
        },
      })
      continue
    }

    failed += 1
    const error = result.error ?? 'The mail server refused the message without saying why.'
    outcomes.push({
      delegateId: recipient.delegateId,
      fullName: recipient.fullName,
      email: recipient.email,
      sent: false,
      error,
    })
    await prisma.allocationAnnouncement.upsert({
      where: { delegateId: recipient.delegateId },
      update: { status: AnnouncementStatus.FAILED, error, attempts },
      create: { delegateId: recipient.delegateId, status: AnnouncementStatus.FAILED, error, attempts },
    })

    if (isRateLimitFailure(error)) {
      rateLimited = true
      break
    }
  }

  return {
    sent,
    failed,
    remaining: recipients.length - sent,
    rateLimited,
    skipped,
    outcomes,
  }
}
