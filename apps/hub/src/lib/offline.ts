import Dexie, { type EntityTable } from 'dexie'
import { ApiError, apiFetch } from './api'
import type { AttendanceStatus, LogisticsRequest, RequestCategory } from '@/types/api'

export interface QueuedLogistics {
  kind: 'logistics'
  title: string
  category: RequestCategory
  description: string
  committeeId: string | null
}

export interface QueuedCheckIn {
  kind: 'attendance'
  delegateId: string
  delegateName: string
  status: AttendanceStatus
}

export type QueuedPayload = QueuedLogistics | QueuedCheckIn

export interface QueuedItem {
  id: number
  payload: QueuedPayload
  createdAt: number
  attempts: number
  lastError?: string
}

const db = new Dexie('munx-offline') as Dexie & {
  queue: EntityTable<QueuedItem, 'id'>
}

db.version(1).stores({
  queue: '++id, createdAt',
})

export { db as offlineDb }

export async function enqueue(payload: QueuedPayload): Promise<number> {
  return db.queue.add({ payload, createdAt: Date.now(), attempts: 0 } as QueuedItem)
}

export async function queueCount(): Promise<number> {
  return db.queue.count()
}

export async function queuedItems(): Promise<QueuedItem[]> {
  return db.queue.orderBy('createdAt').toArray()
}

export async function discardQueued(id: number): Promise<void> {
  await db.queue.delete(id)
}

async function send(payload: QueuedPayload): Promise<void> {
  if (payload.kind === 'logistics') {
    await apiFetch<LogisticsRequest>('/logistics-requests', {
      method: 'POST',
      body: {
        title: payload.title,
        category: payload.category,
        description: payload.description,
        committeeId: payload.committeeId,
      },
    })
    return
  }

  await apiFetch('/attendance/check-in', {
    method: 'POST',
    body: { delegateId: payload.delegateId, status: payload.status },
  })
}

export interface DrainResult {
  synced: number
  failed: number
  remaining: number
}

let draining = false

export async function drainQueue(): Promise<DrainResult> {
  if (draining) return { synced: 0, failed: 0, remaining: await queueCount() }

  draining = true
  let synced = 0
  let failed = 0

  try {
    const items = await queuedItems()

    for (const item of items) {
      try {
        await send(item.payload)
        await db.queue.delete(item.id)
        synced++
      } catch (error) {
        failed++

        if (error instanceof ApiError && error.isOffline) {
          break
        }

        const permanent = error instanceof ApiError && error.code >= 400 && error.code < 500 && error.code !== 429
        if (permanent) {
          await db.queue.delete(item.id)
          console.warn('[offline] dropped unsendable queued item', item.id, error)
        } else {
          await db.queue.update(item.id, {
            attempts: item.attempts + 1,
            lastError: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
    }
  } finally {
    draining = false
  }

  return { synced, failed, remaining: await queueCount() }
}

const PERSONAL_DATA_CACHES = ['api-reference']

export async function clearCachedData(): Promise<void> {
  if (typeof caches === 'undefined') return

  await Promise.all(
    PERSONAL_DATA_CACHES.map((name) =>
      caches.delete(name).catch((error) => {
        console.warn('[offline] could not clear cache', name, error)
        return false
      }),
    ),
  )
}
