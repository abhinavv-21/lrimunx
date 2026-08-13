import Papa from 'papaparse'

export interface MatrixIssue {
  row: number
  column?: string
  reason: string
}

export interface ParsedMatrix {
  committee: string
  countries: string[]
}

export interface MatrixParseResult {
  columns: ParsedMatrix[]
  issues: MatrixIssue[]

  longForm: boolean

  fatal?: string
}

const COMMITTEE_HEADERS = new Set(['committee', 'committee code', 'code', 'body', 'forum'])
const COUNTRY_HEADERS = new Set([
  'country', 'countries', 'nation', 'delegation', 'member', 'member state', 'state',
])

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const norm = (value: string): string => clean(value).toLowerCase()

export function parseMatrixCsv(csv: string): MatrixParseResult {
  const issues: MatrixIssue[] = []

  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: 'greedy' })

  const HARMLESS = new Set(['UndetectableDelimiter', 'TooFewFields', 'TooManyFields'])
  parsed.errors
    .filter((error) => !HARMLESS.has(error.code ?? ''))
    .slice(0, 5)
    .forEach((error) => {
      issues.push({ row: (error.row ?? 0) + 1, reason: error.message })
    })

  const quoteError = parsed.errors.find((error) => /quote/i.test(error.code ?? ''))
  if (quoteError) {
    return {
      columns: [],
      issues,
      longForm: false,
      fatal:
        `There is an unclosed quotation mark near row ${(quoteError.row ?? 0) + 1}. ` +
        'Everything after it was read as part of one field, so the rest of the sheet ' +
        'could not be trusted and nothing was imported. Close the quote, or remove it, ' +
        'and import the file again.',
    }
  }

  const rows = (parsed.data ?? []).filter((row) => Array.isArray(row) && row.some((c) => clean(c)))
  if (rows.length === 0) {
    return { columns: [], issues: [{ row: 0, reason: 'The file is empty.' }], longForm: false }
  }

  const header = rows[0]!.map(clean)
  const body = rows.slice(1)

  const headerNames = header.map(norm)
  const committeeAt = headerNames.findIndex((h) => COMMITTEE_HEADERS.has(h))
  const countryAt = headerNames.findIndex((h) => COUNTRY_HEADERS.has(h))

  if (committeeAt !== -1 && countryAt !== -1) {
    const byCommittee = new Map<string, string[]>()

    const seenPerCommittee = new Map<string, Set<string>>()

    body.forEach((row, index) => {
      const committee = clean(row[committeeAt])
      const country = clean(row[countryAt])
      if (!committee && !country) return
      if (!committee) {
        issues.push({ row: index + 2, reason: `"${country}" has no committee against it.` })
        return
      }
      if (!country) {
        issues.push({ row: index + 2, column: committee, reason: 'No country in this row.' })
        return
      }

      const seen = seenPerCommittee.get(norm(committee)) ?? new Set<string>()
      if (seen.has(norm(country))) {
        issues.push({
          row: index + 2,
          column: committee,
          reason: `"${country}" is listed twice under ${committee}.`,
        })
        return
      }
      seen.add(norm(country))
      seenPerCommittee.set(norm(committee), seen)

      const list = byCommittee.get(committee) ?? []
      list.push(country)
      byCommittee.set(committee, list)
    })

    return {
      columns: [...byCommittee].map(([committee, countries]) => ({ committee, countries })),
      issues,
      longForm: true,
    }
  }

  const columns: ParsedMatrix[] = []
  const seenHeaders = new Set<string>()

  header.forEach((name, columnIndex) => {
    if (!name) return

    if (seenHeaders.has(norm(name))) {
      issues.push({ row: 1, column: name, reason: `"${name}" is used as a heading twice.` })
      return
    }
    seenHeaders.add(norm(name))

    const countries: string[] = []
    const seen = new Set<string>()

    body.forEach((row, index) => {
      const country = clean(row[columnIndex])
      if (!country) return
      if (seen.has(norm(country))) {
        issues.push({
          row: index + 2,
          column: name,
          reason: `"${country}" is listed twice under ${name}.`,
        })
        return
      }
      seen.add(norm(country))
      countries.push(country)
    })

    columns.push({ committee: name, countries })
  })

  if (columns.length === 0) {
    issues.push({ row: 1, reason: 'No column headings were found — the first row should name the committees.' })
  }

  return { columns, issues, longForm: false }
}
