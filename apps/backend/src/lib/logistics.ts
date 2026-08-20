import { RequestCategory, RequestStatus } from '@prisma/client'

/**
 * How urgent a logistics request is, as a number the hub can sort on.
 *
 * THE RULE
 *
 *   score = category weight + age bonus
 *
 *   category weight   PLACARD 40, LOGISTICS 40, STATIONERY 20, AWARDS 10
 *   age bonus         +10 for every full step the request has been open,
 *                     capped at +40. A step is 60 minutes normally and
 *                     5 minutes while the conference is RUNNING.
 *   resolved          score 0, whatever else is true of it
 *
 * Why those numbers.
 *
 * A missing placard and a broken projector stop the room; a delegate can chair
 * a session without a notepad, so STATIONERY sits at half. AWARDS is lowest
 * because it is only urgent on the last afternoon, and by then the conference
 * is running and the age clock is moving twelve times faster, which is exactly
 * what lifts it.
 *
 * The conference-running flag deliberately does not add a flat bonus. During
 * the conference EVERY request is urgent, so a flat bonus would move all of
 * them and reorder none. What actually changes is how fast waiting hurts: a
 * placard request open for half an hour is a to-do in October and a crisis on
 * day 2. So RUNNING compresses the step from an hour to five minutes, which
 * lets an old low-category request overtake a fresh high-category one — the
 * ceiling of +40 is exactly one category band, so it can overtake by one band
 * and no further.
 *
 * The score is computed on read rather than stored, because it changes with the
 * clock and a stored column would be stale the moment it was written.
 */

export const PRIORITY_CATEGORY_WEIGHT: Readonly<Record<RequestCategory, number>> = {
  [RequestCategory.PLACARD]: 40,
  [RequestCategory.LOGISTICS]: 40,
  [RequestCategory.STATIONERY]: 20,
  [RequestCategory.AWARDS]: 10,
}

export const AGE_STEP_MS = 60 * 60_000
export const AGE_STEP_RUNNING_MS = 5 * 60_000
export const AGE_BONUS_PER_STEP = 10
export const AGE_BONUS_CAP = 40

export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'

export interface PriorityInput {
  category: RequestCategory
  status: RequestStatus
  createdAt: Date
  conferenceRunning: boolean
  now?: Date
}

export interface Priority {
  score: number
  level: PriorityLevel
}

export function priorityLevel(score: number): PriorityLevel {
  if (score >= 60) return 'CRITICAL'
  if (score >= 40) return 'HIGH'
  if (score >= 20) return 'NORMAL'
  return 'LOW'
}

export function computePriority(input: PriorityInput): Priority {
  if (input.status === RequestStatus.RESOLVED) return { score: 0, level: 'LOW' }

  const now = input.now ?? new Date()
  const step = input.conferenceRunning ? AGE_STEP_RUNNING_MS : AGE_STEP_MS
  const openForMs = Math.max(0, now.getTime() - input.createdAt.getTime())

  const ageBonus = Math.min(Math.floor(openForMs / step) * AGE_BONUS_PER_STEP, AGE_BONUS_CAP)
  const score = PRIORITY_CATEGORY_WEIGHT[input.category] + ageBonus

  return { score, level: priorityLevel(score) }
}
