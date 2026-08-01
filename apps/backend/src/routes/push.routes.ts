import { Router } from 'express'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { pushSubscribeSchema, pushUnsubscribeSchema } from '../schemas/index.js'

export const pushRouter = Router()

/** Both roles subscribe — an admin needs the alert as much as the floor staff. */

pushRouter.get('/public-key', (_req, res) => {
  res.json({ publicKey: env.pushEnabled ? env.VAPID_PUBLIC_KEY : null, enabled: env.pushEnabled })
})

pushRouter.post(
  '/subscribe',
  validate(pushSubscribeSchema),
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body as { endpoint: string; keys: { p256dh: string; auth: string } }
    const actor = currentUser(req)

    // The endpoint is unique, so a device that re-subscribes (or is handed to
    // another user) rebinds rather than colliding.
    const subscription = await prisma.pushSub.upsert({
      where: { endpoint },
      update: { userId: actor.id, keysP256: keys.p256dh, keysAuth: keys.auth },
      create: { userId: actor.id, endpoint, keysP256: keys.p256dh, keysAuth: keys.auth },
      select: { id: true, endpoint: true, createdAt: true },
    })

    res.status(201).json(subscription)
  }),
)

pushRouter.post(
  '/unsubscribe',
  validate(pushUnsubscribeSchema),
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body as { endpoint: string }
    const actor = currentUser(req)

    // Scoped to the caller so one account cannot unsubscribe another's device.
    await prisma.pushSub.deleteMany({ where: { endpoint, userId: actor.id } })

    res.status(204).send()
  }),
)
