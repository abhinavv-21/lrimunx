import type { AnnounceBatch } from '@/types/api'

/**
 * Driving the chunked allocation mailshot from the screen.
 *
 * The server sends at most a batch per request (twenty-five by default) and
 * reports what is left. Nothing on the server carries the run on afterwards, so
 * the page is the loop: call, read `remaining`, call again until the server
 * says `done`.
 *
 * Kept out of the component so the part that must not go wrong can be tested
 * without a browser. Three things must not go wrong: it has to terminate, it
 * has to stop the moment the provider says the volume is too high, and it has
 * to stop when the operator asks it to. Every one of those is a run that mails
 * several hundred school students otherwise.
 */

/**
 * The ceiling on requests in one run. At the server's batch of twenty-five this
 * is 1,500 delegates, several times the size of the conference, so it is not a
 * limit anyone reaches by sending normally. It is the backstop against a
 * server that keeps answering `done: false` for ever.
 */
export const MAX_BATCHES = 60

/** Why the run finished. Null while it is still going. */
export type RunEnd = 'done' | 'rate-limited' | 'stopped' | 'capped'

export interface RunProgress {
  sent: number
  failed: number
  /** Still waiting after the last batch, as the server counted it. */
  remaining: number
  batches: number
  end: RunEnd | null
  /** What the server said about the rate limit, when it said anything. */
  message?: string
}

export const IDLE_RUN: RunProgress = {
  sent: 0,
  failed: 0,
  remaining: 0,
  batches: 0,
  end: null,
}

export function applyBatch(progress: RunProgress, batch: AnnounceBatch): RunProgress {
  // A rate limit outranks `done`. The server sets `done` when a batch sent
  // nothing, which is exactly what a refused batch looks like, and the operator
  // needs to be told to wait rather than that the run finished.
  const end: RunEnd | null = batch.rateLimited ? 'rate-limited' : batch.done ? 'done' : null

  return {
    sent: progress.sent + batch.sent,
    failed: progress.failed + batch.failed,
    remaining: batch.remaining,
    batches: progress.batches + 1,
    end,
    ...(batch.message !== undefined ? { message: batch.message } : {}),
  }
}

export interface RunOptions {
  /** Sends one batch. Rejections are the caller's to handle. */
  send: () => Promise<AnnounceBatch>
  onProgress?: (progress: RunProgress) => void
  /** Asked between batches, never mid-batch: a batch already sent cannot be recalled. */
  shouldStop?: () => boolean
  maxBatches?: number
}

export async function runAnnouncement({
  send,
  onProgress,
  shouldStop,
  maxBatches = MAX_BATCHES,
}: RunOptions): Promise<RunProgress> {
  let progress = IDLE_RUN

  for (let batch = 0; batch < maxBatches; batch += 1) {
    progress = applyBatch(progress, await send())
    onProgress?.(progress)

    if (progress.end !== null) return progress
    if (shouldStop?.()) return { ...progress, end: 'stopped' }
  }

  return { ...progress, end: 'capped' }
}
