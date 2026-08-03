import { describe, expect, it } from 'vitest'
import { parseCsv, reportIgnoredPlacementColumns, type IngestResult } from './ingestion.js'
import { ApiError } from './errors.js'
import { ingestRowSchema } from '../schemas/index.js'

describe('parseCsv', () => {
  it('maps Google Form style headers onto schema field names', () => {
    const csv = [
      'Full Name,Email Address,Phone Number,School,Grade',
      'Aarav Menon,aarav@example.edu.in,+91 98200 41773,Ridge International School,11',
    ].join('\n')

    const rows = parseCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      fullName: 'Aarav Menon',
      email: 'aarav@example.edu.in',
      phone: '+91 98200 41773',
      schoolName: 'Ridge International School',
      grade: '11',
    })
  })

  it('skips blank lines rather than emitting empty delegates', () => {
    const csv = 'Full Name,Email,Phone,School,Grade\n\n\n'
    expect(parseCsv(csv)).toHaveLength(0)
  })

  it('maps the committee preference under any of its usual headings', () => {
    for (const heading of ['Committee Preference', 'Preferred Committee', 'First Preference']) {
      const csv = `Full Name,Email,${heading}\nAarav Menon,aarav@example.edu.in,UNSC`
      expect(parseCsv(csv)[0]).toMatchObject({ committeePreference: 'UNSC' })
    }
  })

  it('leaves committee and country unmapped — they are allocated, not imported', () => {
    const csv = 'Full Name,Email,Committee,Country\nAarav Menon,aarav@example.edu.in,UNSC,France'
    const row = parseCsv(csv)[0] as Record<string, unknown>

    expect(row).not.toHaveProperty('committeeId')
    expect(row).not.toHaveProperty('country')
    // They survive as unrecognised headers, which the row schema then ignores.
    expect(ingestRowSchema.safeParse(row).success).toBe(false)
  })

  it('throws a 400 ApiError when the CSV is malformed', () => {
    // An unterminated quoted field is a hard parse failure.
    const csv = 'Full Name,Email\n"unterminated,value'
    expect(() => parseCsv(csv)).toThrow(ApiError)
  })
})

describe('ingestRowSchema', () => {
  const valid = {
    fullName: 'Ishani Bhattacharya',
    email: 'ISHANI@Example.EDU.in',
    phone: '+91 98310 22884',
    schoolName: "St. Xavier's Collegiate School",
    grade: '12',
  }

  it('lowercases the email so duplicates cannot slip in by casing', () => {
    const parsed = ingestRowSchema.parse(valid)
    expect(parsed.email).toBe('ishani@example.edu.in')
  })

  it('rejects an invalid email', () => {
    expect(ingestRowSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)
  })

  it('rejects a phone number containing letters', () => {
    expect(ingestRowSchema.safeParse({ ...valid, phone: 'call me' }).success).toBe(false)
  })

  it('rejects a row with no school name', () => {
    expect(ingestRowSchema.safeParse({ ...valid, schoolName: '' }).success).toBe(false)
  })

  it('accepts a committee preference and leaves it exactly as typed', () => {
    const parsed = ingestRowSchema.parse({ ...valid, committeePreference: '  UNHRC  ' })
    expect(parsed.committeePreference).toBe('UNHRC')
  })

  it('treats a missing preference as absent, not blank', () => {
    // The distinction matters on upsert: absent leaves the stored value alone.
    expect(ingestRowSchema.parse(valid).committeePreference).toBeUndefined()
  })

  it('accepts a preference naming a committee that does not exist', () => {
    // A form answer is a wish, not a placement — it is never validated
    // against the committee list.
    const result = ingestRowSchema.safeParse({ ...valid, committeePreference: 'Whatever is left' })
    expect(result.success).toBe(true)
  })

  it('accepts long school names and unicode delegate names', () => {
    const result = ingestRowSchema.safeParse({
      ...valid,
      fullName: 'Zoya Rahmán',
      schoolName: 'The Lawrence School, Sanawar (Himachal Pradesh Residential Campus)',
    })
    expect(result.success).toBe(true)
  })
})

describe('reportIgnoredPlacementColumns', () => {
  const blank = (): IngestResult => ({
    created: 0, updated: 0, skipped: 0, issues: [], phoneCollisions: [],
  })

  it('names the allocation columns it dropped', () => {
    // The case that loses data: an operator exports the roster, edits it in a
    // spreadsheet, imports it back, and every placement is discarded.
    const result = blank()
    reportIgnoredPlacementColumns(parseCsv(
      'fullName,email,phone,schoolName,grade,committee,country\n' +
      "Aarav Menon,aarav@example.edu.in,+91 98200 41773,Ridge International,11,UNSC,France\n",
    ), result)

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.reason).toContain('"committee"')
    expect(result.issues[0]?.reason).toContain('"country"')
    expect(result.issues[0]?.reason).toContain('Allocations')
  })

  it('stays quiet about a committee PREFERENCE, which is read', () => {
    // "committee preference" is an alias of a field the importer stores, so it
    // must not be reported as dropped.
    const result = blank()
    reportIgnoredPlacementColumns(parseCsv(
      'Full Name,Email Address,Phone Number,School,Grade,Committee Preference\n' +
      "Aarav Menon,aarav@example.edu.in,+91 98200 41773,Ridge International,11,DISEC\n",
    ), result)

    expect(result.issues).toEqual([])
  })
})
