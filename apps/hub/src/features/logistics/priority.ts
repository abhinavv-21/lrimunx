import type { LogisticsRequest, PriorityLevel } from '@/types/api'

/**
 * Priority as the board reads it.
 *
 * The score itself is the server's business: category weight plus an age bonus
 * whose clock runs twelve times faster once the conference is running. The
 * client never recomputes it, because two copies of that rule is one copy that
 * drifts. What lives here is the ordering the lanes apply on top, and the words
 * a level is shown as.
 */

export const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
}

/**
 * Highest score first, and where two requests score the same, the one that has
 * been waiting longest. Requests without a score sort last: they come from
 * endpoints that do not compute one (the committee page), not from the board.
 */
export function byPriority(a: LogisticsRequest, b: LogisticsRequest): number {
  const scoreDiff = (b.priority ?? -1) - (a.priority ?? -1)
  if (scoreDiff !== 0) return scoreDiff
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

/** Newest first, for when someone wants the board in the order it arrived. */
export function byNewest(a: LogisticsRequest, b: LogisticsRequest): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}
