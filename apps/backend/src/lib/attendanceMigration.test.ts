import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CONFERENCE_DAYS, FIRST_DAY, LAST_DAY, defaultDay, isConferenceDay } from './conference.js'

/**
 * Guards the one migration in this repository that carries data rather than
 * only adding structure.
 *
 * Attendance used to be a single column on Delegate. Moving it to a row per day
 * is only safe if the CHECKED_IN delegates already in the database arrive in
 * the new table, and if the column they came from is not dropped in the same
 * breath. Both are properties of the SQL text, so they are asserted against the
 * SQL text — a test that ran the migration would only prove it works on an
 * empty database, which is the case that was never in doubt.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = path.resolve(here, '../../../../prisma/migrations')

const attendanceMigration = readFileSync(
  path.join(MIGRATIONS, '20260819091000_per_day_attendance/migration.sql'),
  'utf8',
)

const statements = attendanceMigration
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')

describe('the per-day attendance migration', () => {
  it('creates the table before it writes into it', () => {
    const create = statements.indexOf('CREATE TABLE "DelegateAttendance"')
    const insert = statements.indexOf('INSERT INTO "DelegateAttendance"')

    expect(create).toBeGreaterThanOrEqual(0)
    expect(insert).toBeGreaterThan(create)
  })

  it('carries every CHECKED_IN delegate across to day 1', () => {
    expect(statements).toMatch(/INSERT INTO "DelegateAttendance"[\s\S]*FROM "Delegate"/)
    expect(statements).toMatch(/WHERE "attendanceStatus" = 'CHECKED_IN'/)

    // The day the old column's single value maps onto. Anything else would file
    // the whole of last year's attendance under a day nobody attended.
    const select = statements.slice(statements.indexOf('SELECT gen_random_uuid()'))
    expect(select).toContain(', 1, ')
  })

  it('does not drop or rename the column it read from', () => {
    // The column stays as a maintained mirror. Dropping it in the same
    // migration that fills the new table is the failure mode this whole file
    // exists to catch: the data would be in two places for one statement and
    // in one place afterwards, with no way back if the INSERT was wrong.
    expect(statements).not.toMatch(/DROP\s+COLUMN/i)
    expect(statements).not.toMatch(/RENAME/i)
    expect(statements).not.toMatch(/DROP\s+TABLE/i)
  })

  it('makes one row per delegate per day impossible to duplicate', () => {
    expect(statements).toContain('CREATE UNIQUE INDEX "DelegateAttendance_delegateId_day_key"')
    expect(statements).toMatch(/ON "DelegateAttendance"\("delegateId", "day"\)/)
  })

  it('takes the attendance rows with the delegate when one is deleted', () => {
    expect(statements).toMatch(
      /DelegateAttendance_delegateId_fkey[\s\S]*REFERENCES "Delegate"\("id"\) ON DELETE CASCADE/,
    )
  })

  it('leaves absent delegates without a row rather than inventing three', () => {
    // 20 delegates × 3 days of rows nobody looked at is not data, and it would
    // make "was anyone checked in on day 3" indistinguishable from "did anyone
    // run day 3's desk".
    const insert = statements.slice(statements.indexOf('INSERT INTO "DelegateAttendance"'))
    expect(insert).not.toContain("'ABSENT'")
  })
})

describe('the conference days the migration writes into', () => {
  it('runs on 21, 22 and 23 November 2026', () => {
    expect(CONFERENCE_DAYS.map((d) => d.date)).toEqual(['2026-11-21', '2026-11-22', '2026-11-23'])
    expect(CONFERENCE_DAYS.map((d) => d.day)).toEqual([1, 2, 3])
  })

  it('accepts exactly the three days and nothing either side of them', () => {
    expect(isConferenceDay(FIRST_DAY)).toBe(true)
    expect(isConferenceDay(LAST_DAY)).toBe(true)
    for (const bad of [0, 4, -1, 1.5, NaN, '1', null, undefined]) {
      expect(isConferenceDay(bad)).toBe(false)
    }
  })

  it('sends an unlabelled check-in to the active day once the conference is running', () => {
    expect(defaultDay({ state: 'RUNNING', activeDay: 3, days: CONFERENCE_DAYS })).toBe(3)
  })

  it('sends one to day 1 while the conference is still preparing', () => {
    // A rehearsal check-in has to land somewhere, and day 1 is the only day
    // that is not a guess about a day nobody has reached.
    expect(defaultDay({ state: 'PREPARING', activeDay: 3, days: CONFERENCE_DAYS })).toBe(FIRST_DAY)
  })
})
