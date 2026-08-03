import Papa from 'papaparse'
import { z } from 'zod'
import { prisma } from './prisma.js'
import { ApiError } from './errors.js'
import { ingestRowSchema } from '../schemas/index.js'

export type IngestRow = z.infer<typeof ingestRowSchema>

export interface IngestIssue {
  row: number
  email?: string
  reason: string
}

export interface IngestResult {
  created: number
  updated: number
  skipped: number
  issues: IngestIssue[]
  phoneCollisions: Array<{ phone: string; emails: string[] }>
}

/** Header aliases so operators can paste a Google Form export unchanged. */
const HEADER_ALIASES: Record<string, keyof IngestRow> = {
  'full name': 'fullName', name: 'fullName', 'delegate name': 'fullName',
  'email address': 'email', email: 'email', 'e-mail': 'email',
  'phone number': 'phone', phone: 'phone', mobile: 'phone', contact: 'phone',
  school: 'schoolName', 'school name': 'schoolName', institution: 'schoolName',
  grade: 'grade', class: 'grade', year: 'grade',
  'academic level': 'grade', level: 'grade',
  'committee preference': 'committeePreference', preference: 'committeePreference',
  'preferred committee': 'committeePreference', 'committee choice': 'committeePreference',
  'first preference': 'committeePreference', 'committee preference 1': 'committeePreference',
  'dietary notes': 'dietaryNotes', dietary: 'dietaryNotes', 'food requirements': 'dietaryNotes',
  'accessibility notes': 'accessibilityNotes', accessibility: 'accessibilityNotes',
}

function normaliseHeader(header: string): string {
  const key = header.trim().toLowerCase()
  return HEADER_ALIASES[key] ?? header.trim()
}

/** Blank optional fields come through as empty strings; store them as null. */
function normaliseRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw }
  for (const key of ['committeePreference', 'dietaryNotes', 'accessibilityNotes'] as const) {
    if (typeof out[key] === 'string' && (out[key] as string).trim() === '') out[key] = null
  }
  return out
}

export function parseCsv(csv: string): Record<string, unknown>[] {
  const parsed = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normaliseHeader,
  })

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]
    throw ApiError.badRequest(
      `CSV could not be parsed: ${first?.message ?? 'unknown error'}`,
      { row: first?.row, code: first?.code },
    )
  }

  return parsed.data
}

/**
 * Columns that describe where a delegate SITS, which this importer does not read.
 *
 * A bare `committee` heading is not an alias of `committee preference` — a
 * preference is a wish and a committee is a placement — so it falls through
 * `normaliseHeader` unchanged and is then dropped by the row schema. That is
 * deliberate: importing must not allocate, because a placement has to clear
 * seat capacity, the unique country per committee, and the country matrix,
 * none of which this path enforces. Approving a registration leaves placement
 * unset for exactly the same reason.
 *
 * What was wrong was doing it in silence. An operator exporting the roster,
 * editing it in a spreadsheet and importing it back got `created: n` and no
 * hint that every allocation in the file had been discarded — the delegates
 * come back unplaced and nothing anywhere says why. Naming the columns costs
 * one line and turns silent data loss into a decision.
 */
const PLACEMENT_HEADERS = new Set([
  'committee', 'committee code', 'country', 'allocation', 'allocated committee',
  'allocated country', 'assigned committee', 'assigned country', 'delegation',
])

export function reportIgnoredPlacementColumns(rows: unknown[], result: IngestResult): void {
  const headers = new Set<string>()
  rows.forEach((row) => {
    if (row && typeof row === 'object') {
      Object.keys(row as Record<string, unknown>).forEach((key) => headers.add(key.trim().toLowerCase()))
    }
  })

  const ignored = [...headers].filter((header) => PLACEMENT_HEADERS.has(header))
  if (ignored.length === 0) return

  result.issues.push({
    row: 0,
    reason:
      `${ignored.map((h) => `"${h}"`).join(' and ')} ${ignored.length === 1 ? 'was' : 'were'} ignored. ` +
      'Importing adds delegates but never places them, because a placement has to be ' +
      'checked against seat capacity and the country matrix. Set committees and countries ' +
      'in Allocations after the import.',
  })
}

/**
 * Ingests delegate rows from Google Sheets/Forms or a pasted CSV.
 *
 * Email is the identity key — it is unique in the schema, so a repeat email
 * either updates the existing delegate (upsert) or is skipped. Phone is NOT
 * unique in the schema; shared numbers are legitimate (siblings, a teacher
 * registering a group), so a phone shared across different emails is reported
 * as a collision for review rather than rejected.
 */
export async function ingestDelegates(rows: unknown[], upsert: boolean): Promise<IngestResult> {
  const result: IngestResult = { created: 0, updated: 0, skipped: 0, issues: [], phoneCollisions: [] }

  reportIgnoredPlacementColumns(rows, result)

  const valid: IngestRow[] = []
  const seenEmails = new Map<string, number>()

  rows.forEach((raw, index) => {
    const rowNumber = index + 2 // +1 for zero-index, +1 for the header line
    const parsed = ingestRowSchema.safeParse(normaliseRow(raw as Record<string, unknown>))

    if (!parsed.success) {
      const reason = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      result.issues.push({ row: rowNumber, email: (raw as { email?: string })?.email, reason })
      result.skipped++
      return
    }

    const previous = seenEmails.get(parsed.data.email)
    if (previous !== undefined) {
      result.issues.push({
        row: rowNumber,
        email: parsed.data.email,
        reason: `Duplicate email within this batch — first seen on row ${previous}. Later row ignored.`,
      })
      result.skipped++
      return
    }

    seenEmails.set(parsed.data.email, rowNumber)
    valid.push(parsed.data)
  })

  if (valid.length === 0) return result

  const existing = await prisma.delegate.findMany({
    where: { email: { in: valid.map((r) => r.email) } },
    select: { id: true, email: true },
  })
  const existingByEmail = new Map(existing.map((d) => [d.email, d.id]))

  for (const row of valid) {
    const existingId = existingByEmail.get(row.email)

    if (existingId && !upsert) {
      result.issues.push({ row: seenEmails.get(row.email) ?? 0, email: row.email, reason: 'Delegate already exists — skipped because upsert is disabled.' })
      result.skipped++
      continue
    }

    const required = {
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      schoolName: row.schoolName,
      grade: row.grade,
    }

    /**
     * A column the sheet does not carry must not erase what the app already
     * holds. `undefined` means "this import says nothing about that field", so
     * it is omitted from the update; an explicit blank cell arrives as `null`
     * and does clear the value.
     */
    const optional = {
      ...(row.committeePreference !== undefined ? { committeePreference: row.committeePreference } : {}),
      ...(row.dietaryNotes !== undefined ? { dietaryNotes: row.dietaryNotes } : {}),
      ...(row.accessibilityNotes !== undefined ? { accessibilityNotes: row.accessibilityNotes } : {}),
    }

    if (existingId) {
      await prisma.delegate.update({ where: { id: existingId }, data: { ...required, ...optional } })
      result.updated++
    } else {
      await prisma.delegate.create({
        data: {
          ...required,
          committeePreference: row.committeePreference ?? null,
          dietaryNotes: row.dietaryNotes ?? null,
          accessibilityNotes: row.accessibilityNotes ?? null,
        },
      })
      result.created++
    }
  }

  // Report shared phone numbers across distinct delegates for manual review.
  const phones = [...new Set(valid.map((r) => r.phone))]
  const sharing = await prisma.delegate.findMany({
    where: { phone: { in: phones } },
    select: { phone: true, email: true },
  })
  const byPhone = new Map<string, string[]>()
  for (const delegate of sharing) {
    byPhone.set(delegate.phone, [...(byPhone.get(delegate.phone) ?? []), delegate.email])
  }
  for (const [phone, emails] of byPhone) {
    if (emails.length > 1) result.phoneCollisions.push({ phone, emails })
  }

  return result
}
