import type { ConferenceDay, ConferenceMode } from '@/types/api'

/**
 * Conference mode as the rest of the hub needs it.
 *
 * The three days and their dates come from the server (21, 22 and 23 November
 * 2026) rather than being repeated here, so moving the conference is one
 * change in one place. What this file holds is the two rules the client has to
 * apply to that answer: which day a screen should open on, and how a day reads
 * on a pill.
 */

/**
 * The day a screen opens on. Mirrors the server's own default: the active day
 * while the conference is running, day 1 before it starts, because a rehearsal
 * check-in has to land somewhere, and the day it finished on once it has ended,
 * because that is the day still being argued about the morning after.
 */
export function defaultDay(mode: ConferenceMode | undefined): number {
  if (!mode) return 1
  return mode.state === 'PREPARING' ? 1 : mode.activeDay
}

/** "21 Nov" — short enough for a tab on a 390px screen. */
export function formatDayDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function findDay(
  days: readonly ConferenceDay[] | undefined,
  day: number,
): ConferenceDay | undefined {
  return days?.find((entry) => entry.day === day)
}
