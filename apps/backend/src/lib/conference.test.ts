import { describe, expect, it } from 'vitest'
import {
  CONFERENCE_DAYS,
  FIRST_DAY,
  assertConferenceOpen,
  defaultDay,
  parseConferenceState,
  readConferenceMode,
  writeConferenceMode,
  type ConferenceMode,
  type ConferenceState,
} from './conference.js'
import type { PrismaTransaction } from './prisma.js'
import { ApiError } from './errors.js'

/**
 * A Setting table in a Map, so the round trip through writeConferenceMode and
 * readConferenceMode can be exercised without Postgres. The unit suite does not
 * need a database, and the bug these tests exist for is in the parsing, not in
 * the storage.
 */
function settingsStore(initial: Record<string, string> = {}): PrismaTransaction {
  const rows = new Map(Object.entries(initial))

  return {
    setting: {
      findMany: ({ where }: { where: { key: { in: string[] } } }) =>
        Promise.resolve(
          where.key.in
            .filter((key) => rows.has(key))
            .map((key) => ({ key, value: rows.get(key) as string })),
        ),
      upsert: ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        rows.set(where.key, update.value)
        return Promise.resolve({ key: where.key, value: update.value })
      },
    },
  } as unknown as PrismaTransaction
}

const mode = (state: ConferenceState, activeDay = 1): ConferenceMode => ({
  state,
  activeDay,
  days: CONFERENCE_DAYS,
})

describe('reading the conference state back out of Setting', () => {
  it('recognises all three states, and nothing else', () => {
    expect(parseConferenceState('PREPARING')).toBe('PREPARING')
    expect(parseConferenceState('RUNNING')).toBe('RUNNING')
    expect(parseConferenceState('ENDED')).toBe('ENDED')
  })

  it('reads anything it does not recognise as PREPARING', () => {
    // PREPARING grants nothing and blocks nothing, so it is the only safe
    // reading of a row somebody typed by hand.
    for (const stored of [undefined, '', 'running', 'FINISHED', 'ENDED ']) {
      expect(parseConferenceState(stored)).toBe('PREPARING')
    }
  })

  it.each(['PREPARING', 'RUNNING', 'ENDED'] as const)(
    'survives a write and a read back as %s',
    async (state) => {
      const client = settingsStore()

      const written = await writeConferenceMode({ state, activeDay: 3 }, client)
      expect(written.state).toBe(state)

      // The read that matters is a fresh one. An ENDED that parsed as PREPARING
      // would reopen the conference on the very next request, silently.
      expect((await readConferenceMode(client)).state).toBe(state)
    },
  )

  it('holds the day it was left on across a state change', async () => {
    const client = settingsStore()

    await writeConferenceMode({ state: 'RUNNING', activeDay: 3 }, client)
    const ended = await writeConferenceMode({ state: 'ENDED' }, client)

    expect(ended).toMatchObject({ state: 'ENDED', activeDay: 3 })
  })
})

describe('the day an unlabelled check-in or summary lands on', () => {
  it('follows the conference while it is running', () => {
    expect(defaultDay(mode('RUNNING', 3))).toBe(3)
  })

  it('is day 1 before it starts, so a rehearsal check-in lands somewhere', () => {
    expect(defaultDay(mode('PREPARING', 3))).toBe(FIRST_DAY)
  })

  it('stays on the day it finished on once it has ended', () => {
    // Dropping back to day 1 would open the attendance screen on the morning
    // nobody is still arguing about.
    expect(defaultDay(mode('ENDED', 3))).toBe(3)
  })
})

describe('the record goes read-only once the conference has ended', () => {
  it('lets a write through while preparing and while running', () => {
    expect(() => assertConferenceOpen(mode('PREPARING'))).not.toThrow()
    expect(() => assertConferenceOpen(mode('RUNNING', 2))).not.toThrow()
  })

  it('refuses one with a 409 that says the conference has ended and who can reopen it', () => {
    try {
      assertConferenceOpen(mode('ENDED', 3))
      expect.unreachable('An ended conference should refuse the write')
    } catch (caught) {
      expect(caught).toBeInstanceOf(ApiError)
      const error = caught as ApiError
      expect(error.code).toBe(409)
      expect(error.message).toMatch(/conference has ended/i)
      expect(error.message).toMatch(/owner/i)
    }
  })
})
