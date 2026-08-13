import webpush from 'web-push'
import { env } from '../config/env.js'
import { prisma } from './prisma.js'

let configured = false

export function initialisePush(): void {
  if (!env.pushEnabled) return
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  configured = true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!configured || userIds.length === 0) return

  const subscriptions = await prisma.pushSub.findMany({ where: { userId: { in: userIds } } })
  if (subscriptions.length === 0) return

  const body = JSON.stringify(payload)
  const stale: string[] = []

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keysP256, auth: sub.keysAuth } },
          body,
        )
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          stale.push(sub.id)
        } else {
          console.warn(`[push] delivery failed for subscription ${sub.id}:`, statusCode ?? error)
        }
      }
    }),
  )

  if (stale.length > 0) {
    await prisma.pushSub.deleteMany({ where: { id: { in: stale } } })
  }
}

export async function notifyAdmins(payload: PushPayload): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  await sendPushToUsers(admins.map((a) => a.id), payload)
}
