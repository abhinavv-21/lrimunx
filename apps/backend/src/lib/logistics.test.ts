import { describe, expect, it } from 'vitest'
import { RequestCategory, RequestStatus } from '@prisma/client'
import {
  AGE_BONUS_CAP,
  AGE_STEP_MS,
  AGE_STEP_RUNNING_MS,
  PRIORITY_CATEGORY_WEIGHT,
  computePriority,
  priorityLevel,
} from './logistics.js'

const NOW = new Date('2026-11-22T10:00:00Z')

function score(
  category: RequestCategory,
  minutesOpen: number,
  conferenceRunning = false,
  status: RequestStatus = RequestStatus.OPEN,
): number {
  return computePriority({
    category,
    status,
    createdAt: new Date(NOW.getTime() - minutesOpen * 60_000),
    conferenceRunning,
    now: NOW,
  }).score
}

describe('computePriority — category', () => {
  it('scores a brand new request at exactly its category weight', () => {
    for (const category of Object.values(RequestCategory)) {
      expect(score(category, 0)).toBe(PRIORITY_CATEGORY_WEIGHT[category])
    }
  })

  it('ranks the categories that stop a room above the ones that do not', () => {
    expect(score(RequestCategory.PLACARD, 0)).toBe(score(RequestCategory.LOGISTICS, 0))
    expect(score(RequestCategory.PLACARD, 0)).toBeGreaterThan(score(RequestCategory.STATIONERY, 0))
    expect(score(RequestCategory.STATIONERY, 0)).toBeGreaterThan(score(RequestCategory.AWARDS, 0))
  })

  it('puts a fresh PLACARD and LOGISTICS at HIGH and everything else below it', () => {
    // This is the old HIGH_PRIORITY set, now derived rather than listed. The
    // push notification title depends on it staying true.
    expect(computePriority({
      category: RequestCategory.PLACARD,
      status: RequestStatus.OPEN,
      createdAt: NOW,
      conferenceRunning: false,
      now: NOW,
    }).level).toBe('HIGH')

    expect(computePriority({
      category: RequestCategory.STATIONERY,
      status: RequestStatus.OPEN,
      createdAt: NOW,
      conferenceRunning: false,
      now: NOW,
    }).level).toBe('NORMAL')
  })
})

describe('computePriority — age', () => {
  it('adds nothing until a full step has passed', () => {
    expect(score(RequestCategory.AWARDS, 59)).toBe(PRIORITY_CATEGORY_WEIGHT.AWARDS)
    expect(score(RequestCategory.AWARDS, 60)).toBe(PRIORITY_CATEGORY_WEIGHT.AWARDS + 10)
  })

  it('escalates twelve times faster while the conference is running', () => {
    const minutes = AGE_STEP_RUNNING_MS / 60_000
    expect(score(RequestCategory.AWARDS, minutes, true)).toBe(PRIORITY_CATEGORY_WEIGHT.AWARDS + 10)
    expect(score(RequestCategory.AWARDS, minutes, false)).toBe(PRIORITY_CATEGORY_WEIGHT.AWARDS)
    expect(AGE_STEP_MS / AGE_STEP_RUNNING_MS).toBe(12)
  })

  it('stops climbing at the cap, however long it sits there', () => {
    const week = 7 * 24 * 60
    expect(score(RequestCategory.AWARDS, week)).toBe(PRIORITY_CATEGORY_WEIGHT.AWARDS + AGE_BONUS_CAP)
    expect(score(RequestCategory.AWARDS, week * 52)).toBe(
      PRIORITY_CATEGORY_WEIGHT.AWARDS + AGE_BONUS_CAP,
    )
  })

  it('lets an old low-category request overtake a fresh high-category one', () => {
    const staleAwards = score(RequestCategory.AWARDS, 60 * 24)
    const freshPlacard = score(RequestCategory.PLACARD, 0)
    expect(staleAwards).toBeGreaterThan(freshPlacard)
  })

  it('never lets waiting buy more than one category band', () => {
    // AGE_BONUS_CAP is exactly the gap between PLACARD and STATIONERY, so a
    // request can climb one band and no further on age alone.
    const maxAged = score(RequestCategory.STATIONERY, 60 * 24 * 30)
    expect(maxAged).toBe(PRIORITY_CATEGORY_WEIGHT.STATIONERY + AGE_BONUS_CAP)
    expect(maxAged).toBeLessThanOrEqual(
      PRIORITY_CATEGORY_WEIGHT.PLACARD + AGE_BONUS_CAP,
    )
  })

  it('does not go negative on a row whose clock is ahead of the server', () => {
    expect(score(RequestCategory.PLACARD, -600)).toBe(PRIORITY_CATEGORY_WEIGHT.PLACARD)
  })
})

describe('computePriority — resolved work', () => {
  it('drops a resolved request to the bottom regardless of category or age', () => {
    for (const category of Object.values(RequestCategory)) {
      const priority = computePriority({
        category,
        status: RequestStatus.RESOLVED,
        createdAt: new Date(NOW.getTime() - 60 * 60_000 * 48),
        conferenceRunning: true,
        now: NOW,
      })
      expect(priority).toEqual({ score: 0, level: 'LOW' })
    }
  })

  it('keeps scoring work that is in progress', () => {
    expect(score(RequestCategory.PLACARD, 0, false, RequestStatus.IN_PROGRESS)).toBe(
      PRIORITY_CATEGORY_WEIGHT.PLACARD,
    )
  })
})

describe('priorityLevel', () => {
  it('bands the score the same way in both directions across every boundary', () => {
    expect(priorityLevel(0)).toBe('LOW')
    expect(priorityLevel(19)).toBe('LOW')
    expect(priorityLevel(20)).toBe('NORMAL')
    expect(priorityLevel(39)).toBe('NORMAL')
    expect(priorityLevel(40)).toBe('HIGH')
    expect(priorityLevel(59)).toBe('HIGH')
    expect(priorityLevel(60)).toBe('CRITICAL')
    expect(priorityLevel(80)).toBe('CRITICAL')
  })
})
