import { describe, expect, it } from 'vitest'
import { byNewest, byPriority } from './priority'
import type { LogisticsRequest, PriorityLevel } from '@/types/api'

function request(
  id: string,
  createdAt: string,
  priority?: number,
  priorityLevel: PriorityLevel = 'NORMAL',
): LogisticsRequest {
  return {
    id,
    title: id,
    category: 'PLACARD',
    description: 'Placards missing from the room.',
    status: 'OPEN',
    createdAt,
    updatedAt: createdAt,
    committee: null,
    createdBy: { id: 'user-1', fullName: 'Riya Shrestha' },
    resolvedBy: null,
    day: 2,
    ...(priority === undefined ? {} : { priority, priorityLevel }),
  }
}

const order = (items: LogisticsRequest[]) => [...items].sort(byPriority).map((r) => r.id)

describe('ordering the board by priority', () => {
  it('puts the highest score first', () => {
    const items = [
      request('stationery', '2026-11-22T09:00:00.000Z', 20),
      request('placard', '2026-11-22T09:00:00.000Z', 60, 'CRITICAL'),
      request('awards', '2026-11-22T09:00:00.000Z', 10, 'LOW'),
    ]

    expect(order(items)).toEqual(['placard', 'stationery', 'awards'])
  })

  it('breaks a tie in favour of whoever has been waiting longest', () => {
    const items = [
      request('just-raised', '2026-11-22T11:30:00.000Z', 40, 'HIGH'),
      request('waiting-since-nine', '2026-11-22T09:00:00.000Z', 40, 'HIGH'),
    ]

    expect(order(items)).toEqual(['waiting-since-nine', 'just-raised'])
  })

  it('lets an old low-category request overtake a fresh high-category one', () => {
    // The server's age bonus is what moves it; the board only has to not undo that.
    const items = [
      request('fresh-placard', '2026-11-22T11:55:00.000Z', 40, 'HIGH'),
      request('stale-awards', '2026-11-22T09:00:00.000Z', 50, 'HIGH'),
    ]

    expect(order(items)).toEqual(['stale-awards', 'fresh-placard'])
  })

  it('sinks requests that carry no score, rather than floating them to the top', () => {
    const items = [
      request('from-committee-page', '2026-11-22T09:00:00.000Z'),
      request('scored-low', '2026-11-22T11:00:00.000Z', 10, 'LOW'),
    ]

    expect(order(items)).toEqual(['scored-low', 'from-committee-page'])
  })
})

describe('ordering the board by arrival', () => {
  it('ignores the score entirely and puts the newest first', () => {
    const items = [
      request('nine', '2026-11-22T09:00:00.000Z', 80, 'CRITICAL'),
      request('eleven', '2026-11-22T11:00:00.000Z', 10, 'LOW'),
    ]

    expect([...items].sort(byNewest).map((r) => r.id)).toEqual(['eleven', 'nine'])
  })
})
