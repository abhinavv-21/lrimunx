import { Router } from 'express'
import { auditRequest } from '../lib/audit.js'
import { readConferenceMode, writeConferenceMode } from '../lib/conference.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { requireAdmin } from '../middleware/rbac.js'
import { setConferenceDaySchema } from '../schemas/index.js'

export const conferenceRouter = Router()

/**
 * Conference mode: PREPARING before the doors open, RUNNING for the three days
 * of it, plus which day the conference is on.
 *
 * Two things read it and behave differently. A logistics request filed while
 * RUNNING is stamped with the active day and its priority clock runs twelve
 * times faster (see lib/logistics.ts); a check-in with no day named lands on
 * the active one, so a volunteer at the desk on Sunday cannot silently mark
 * Saturday.
 *
 * Reading it is open to any signed-in account, because half the hub needs to
 * know which day it is. Flipping it is ADMIN — it is running the conference,
 * not owning the deployment, so it deliberately does not sit behind
 * requireOwner the way settings and the danger zone do.
 */
conferenceRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await readConferenceMode())
  }),
)

conferenceRouter.post(
  '/start',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const before = await readConferenceMode()
    const after = await writeConferenceMode({ state: 'RUNNING' })

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

conferenceRouter.post(
  '/day',
  requireAdmin,
  validate(setConferenceDaySchema),
  asyncHandler(async (req, res) => {
    const { day } = req.body as { day: number }

    const before = await readConferenceMode()
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
