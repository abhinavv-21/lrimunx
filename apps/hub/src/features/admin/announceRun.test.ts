import { describe, expect, it, vi } from 'vitest'
import { MAX_BATCHES, applyBatch, runAnnouncement, IDLE_RUN } from './announceRun'
import type { AnnounceBatch } from '@/types/api'

const EMPTY_COUNTS = {
  NO_ALLOCATION: 0,
  NO_EMAIL: 0,
  ALREADY_SENT: 0,
  NO_STUDY_GUIDE: 0,
}

function batch(over: Partial<AnnounceBatch> = {}): AnnounceBatch {
  return {
    sent: 25,
    failed: 0,
    remaining: 0,
    rateLimited: false,
    done: true,
    outcomes: [],
    excludedCounts: EMPTY_COUNTS,
    ...over,
  }
}

/** A server with `count` delegates left, answering one batch of 25 at a time. */
function server(count: number) {
  let left = count
  return vi.fn(async () => {
    const sent = Math.min(25, left)
    left -= sent
    return batch({ sent, remaining: left, done: left === 0 })
  })
}

describe('driving the chunked send', () => {
  it('calls again until the server says it is done, and adds the batches up', async () => {
    const send = server(60)

    const run = await runAnnouncement({ send })

    expect(send).toHaveBeenCalledTimes(3)
    expect(run).toMatchObject({ sent: 60, failed: 0, remaining: 0, batches: 3, end: 'done' })
  })

  it('reports each batch as it lands rather than only at the end', async () => {
    const seen: number[] = []

    await runAnnouncement({ send: server(60), onProgress: (p) => seen.push(p.sent) })

    expect(seen).toEqual([25, 50, 60])
  })

  it('stops the moment the provider refuses for volume, with more still waiting', async () => {
    const send = vi
      .fn<() => Promise<AnnounceBatch>>()
      .mockResolvedValueOnce(batch({ sent: 25, remaining: 300, done: false }))
      .mockResolvedValueOnce(
        batch({
          sent: 4,
          failed: 1,
          remaining: 296,
          rateLimited: true,
          done: false,
          message: 'Wait an hour before sending the rest.',
        }),
      )

    const run = await runAnnouncement({ send })

    expect(send).toHaveBeenCalledTimes(2)
    expect(run).toMatchObject({
      sent: 29,
      failed: 1,
      remaining: 296,
      end: 'rate-limited',
      message: 'Wait an hour before sending the rest.',
    })
  })

  it('treats a rate limit as a rate limit even when the server also calls it done', async () => {
    const send = vi.fn(async () => batch({ sent: 0, failed: 3, remaining: 40, rateLimited: true }))

    const run = await runAnnouncement({ send })

    expect(send).toHaveBeenCalledTimes(1)
    expect(run.end).toBe('rate-limited')
  })

  it('stops between batches when the operator asks, and never mid-batch', async () => {
    const send = server(200)

    const run = await runAnnouncement({ send, shouldStop: () => true })

    expect(send).toHaveBeenCalledTimes(1)
    expect(run).toMatchObject({ sent: 25, remaining: 175, batches: 1, end: 'stopped' })
  })

  it('terminates at the cap when the server never admits to being done', async () => {
    // The failure this guards against: a batch that sends nothing and reports
    // work left would otherwise loop for as long as the tab is open.
    const send = vi.fn(async () => batch({ sent: 1, remaining: 999, done: false }))

    const run = await runAnnouncement({ send, maxBatches: 5 })

    expect(send).toHaveBeenCalledTimes(5)
    expect(run).toMatchObject({ batches: 5, end: 'capped' })
  })

  it('caps a run at MAX_BATCHES when no cap is given', async () => {
    const send = vi.fn(async () => batch({ sent: 1, remaining: 999, done: false }))

    const run = await runAnnouncement({ send })

    expect(send).toHaveBeenCalledTimes(MAX_BATCHES)
    expect(run.end).toBe('capped')
  })

  it('lets a rejected batch through to the caller instead of retrying it', async () => {
    const send = vi.fn().mockRejectedValue(new Error('The session has expired.'))

    await expect(runAnnouncement({ send })).rejects.toThrow('The session has expired.')
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('adding a batch to what has been sent so far', () => {
  it('keeps the remaining count the server reported, not a running subtraction', async () => {
    const first = applyBatch(IDLE_RUN, batch({ sent: 25, remaining: 300, done: false }))
    const second = applyBatch(first, batch({ sent: 25, remaining: 275, done: false }))

    expect(second).toMatchObject({ sent: 50, remaining: 275, batches: 2, end: null })
  })

  it('carries no message when the server sent none', () => {
    expect(applyBatch(IDLE_RUN, batch())).not.toHaveProperty('message')
  })
})
