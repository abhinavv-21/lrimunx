import { Router } from 'express'
import type { Request } from 'express'
import { auditRequest } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  readConferenceMode,
  writeConferenceMode,
  type ConferenceMode,
  type ConferenceState,
} from '../lib/conference.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { requireAdmin, requireOwner } from '../middleware/rbac.js'
import { setConferenceDaySchema } from '../schemas/index.js'

export const conferenceRouter = Router()

/**
 * Conference mode: PREPARING before the doors open, RUNNING for the three days
 * of it, ENDED once it is over, plus which day the conference is on.
 *
 * The transitions are start (PREPARING → RUNNING), end (RUNNING → ENDED) and
 * reopen (ENDED → RUNNING). Nothing returns to PREPARING; that takes a reset.
 *
 * Three things read the state and behave differently.
 *
 * A check-in with no day named lands on the active one, so a volunteer at the
 * desk on Sunday cannot silently mark Saturday. After ENDED the active day is
 * still whatever the conference finished on, which is what the attendance
 * screen wants to open on the morning after.
 *
 * A logistics request filed while RUNNING is stamped with the active day and
 * its priority clock runs twelve times faster (see lib/logistics.ts). ENDED
 * puts that clock back to the ordinary hourly step: waiting no longer hurts
 * anybody, the queue is a record rather than a queue, and leaving it compressed
 * would have every leftover request pinned at CRITICAL for good.
 *
 * Attendance and logistics writes are refused outright while ENDED, so the
 * record of the three days cannot be edited after the fact.
 *
 * Reading the mode is open to any signed-in account, because half the hub needs
 * to know which day it is. Starting it and moving the day are ADMIN, because
 * that is running the conference and several people on the secretariat do it.
 * Ending it and reopening it are the owner's, for the same reason the danger
 * zone is: ending freezes the record everyone else is writing to, and reopening
 * unfreezes it.
 */
conferenceRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await readConferenceMode())
  }),
)

/**
 * Writes the new state and audits what it replaced.
 *
 * The before/after pair is the point: an audit row reading PREPARING → RUNNING
 * is the only record of when the conference actually began, and ENDED → RUNNING
 * the only record that somebody reopened it after the fact.
 */
async function moveTo(
  req: Request,
  before: ConferenceMode,
  state: ConferenceState,
): Promise<ConferenceMode> {
  const after = await writeConferenceMode({ state })

  await auditRequest(req, {
    action: 'UPDATE',
    entityType: 'Conference',
    entityId: 'mode',
    payloadBefore: before,
    payloadAfter: after,
  })

  return after
}

conferenceRouter.post(
  '/start',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const before = await readConferenceMode()
    if (before.state === 'ENDED') {
      throw ApiError.conflict('The conference has ended. Reopening it is the hub owner’s to do.')
    }

    res.json(await moveTo(req, before, 'RUNNING'))
  }),
)

conferenceRouter.post(
  '/end',
  requireOwner,
  asyncHandler(async (req, res) => {
    const before = await readConferenceMode()
    if (before.state !== 'RUNNING') {
      throw ApiError.conflict(
        before.state === 'ENDED'
          ? 'The conference has already ended.'
          : 'The conference has not started, so there is nothing to end.',
      )
    }

    res.json(await moveTo(req, before, 'ENDED'))
  }),
)

conferenceRouter.post(
  '/reopen',
  requireOwner,
  asyncHandler(async (req, res) => {
    const before = await readConferenceMode()
    if (before.state !== 'ENDED') {
      throw ApiError.conflict('The conference has not ended, so there is nothing to reopen.')
    }

    // Back to RUNNING on the day it finished on, not to PREPARING and not to
    // day 1: reopening is for correcting the record of a conference that
    // happened, so it should land where it left off.
    res.json(await moveTo(req, before, 'RUNNING'))
  }),
)

conferenceRouter.post(
  '/day',
  requireAdmin,
  validate(setConferenceDaySchema),
  asyncHandler(async (req, res) => {
    const { day } = req.body as { day: number }

    const before = await readConferenceMode()
    if (before.state === 'ENDED') {
      throw ApiError.conflict(
        'The conference has ended. Moving the day would change which one the attendance screen opens on; reopen it first.',
      )
    }

    const after = await writeConferenceMode({ activeDay: day })

    await auditRequest(req, {
      action: 'UPDATE',
      entityType: 'Conference',
      entityId: 'mode',
      payloadBefore: before,
      payloadAfter: after,
    })

    res.json(after)
  }),
)
