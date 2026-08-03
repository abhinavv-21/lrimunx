/**
 * matrix.ts — reading a country matrix out of a spreadsheet.
 *
 * THE SHAPE
 * The matrix is authored WIDE: one column per committee, countries listed down
 * each. That is how a secretariat actually builds one, because you write a
 * committee's list in one go and the columns are naturally different lengths.
 *
 *     UNSC,DISEC,WHO
 *     France,India,Brazil
 *     China,Egypt,
 *     ,Japan,
 *
 * Long form (Committee,Country per row) is accepted too, because it is what
 * comes back out of a database and someone will paste it in eventually. The two
 * are told apart by the header: exactly two columns named like "committee" and
 * "country" is long form, anything else is wide.
 *
 * WHAT IT REFUSES TO DO
 * It never invents a committee. A column headed by something no committee
 * matches is reported and skipped — creating one would mean guessing a seat
 * count, and a committee with the wrong capacity silently over-allocates.
 */
import Papa from 'papaparse'

export interface MatrixIssue {
  /** 1-based row in the source, or 0 for a problem with the header itself. */
  row: number
  column?: string
  reason: string
}

export interface ParsedMatrix {
  /** Committee identifier exactly as written in the sheet — a code or a name. */
  committee: string
  countries: string[]
}

export interface MatrixParseResult {
  columns: ParsedMatrix[]
  issues: MatrixIssue[]
  /** True when the sheet was read as Committee,Country rows rather than wide. */
  longForm: boolean
  /**
   * Set when the file cannot be trusted at all, and nothing in it may be
   * written. `columns` is empty whenever this is present.
   */
  fatal?: string
}

const COMMITTEE_HEADERS = new Set(['committee', 'committee code', 'code', 'body', 'forum'])
const COUNTRY_HEADERS = new Set([
  'country', 'countries', 'nation', 'delegation', 'member', 'member state', 'state',
])

/**
 * Excel and Google Sheets both leave these behind, and they are invisible.
 *
 * A non-breaking space in "Korea, Republic of" makes it a different string
 * from the one typed into the allocation field, and the mismatch cannot be
 * seen on screen — the two look identical and the save is refused with no
 * cause anyone can read. Written as escapes rather than literal characters
 * for the same reason: nobody can review a regex made of invisible glyphs.
 */
function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ') // non-breaking space
    .replace(/[\u200b-\u200d\ufeff]/g, '') // zero-width spaces and the BOM
    .replace(/\s+/g, ' ')
    .trim()
}

const norm = (value: string): string => clean(value).toLowerCase()

/**
 * Parse a matrix CSV.
 *
 * Never throws on content — a malformed sheet comes back as issues, because the
 * operator needs to be told which row is wrong, not handed a 500.
 */
export function parseMatrixCsv(csv: string): MatrixParseResult {
  const issues: MatrixIssue[] = []

  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: 'greedy' })

  /*
    Two of Papa's complaints are normal here and must not reach the operator.

    `UndetectableDelimiter` fires on any single-column file — a matrix for one
    committee, which is exactly what a conference imports first. Papa parses it
    correctly and falls back to a comma; the warning is about ambiguity, not
    failure.

    `TooFewFields`/`TooManyFields` fire on ragged rows, and a wide matrix is
    ragged by construction: the committees have different numbers of countries,
    so every row past the shortest column is short.

    Quote errors are kept. Those mean a field ran on and swallowed the rest of
    the file, which silently loses countries.
  */
  const HARMLESS = new Set(['UndetectableDelimiter', 'TooFewFields', 'TooManyFields'])
  parsed.errors
    .filter((error) => !HARMLESS.has(error.code ?? ''))
    .slice(0, 5)
    .forEach((error) => {
      issues.push({ row: (error.row ?? 0) + 1, reason: error.message })
    })

  /*
    A quote error stops the import dead, rather than being reported beside a
    partial result.

    Every other complaint in this parser is local: one row is wrong and the
    rest of the sheet is still true. A runaway quote is not local. The field
    swallows everything after it — delimiters, line breaks and all — so what
    Papa hands back is not a damaged version of the sheet, it is a different
    sheet. Importing

        UNSC,DISEC
        "France,India
        China,Egypt

    used to succeed with `added: 1`, and gave UNSC a country literally named
    `France,India China,Egypt` while DISEC's entire column vanished, reported
    only as "This column has no countries in it." That country then appeared
    in the allocation pick-list, where it looks like a real choice.

    There is no way to tell from here which half of the file was intended, so
    the honest answer is to write nothing and say where the quote is.
  */
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

  /* ---------------------------------------------------------------------
     Long form — exactly the two columns, in either order.
     --------------------------------------------------------------------- */
  const headerNames = header.map(norm)
  const committeeAt = headerNames.findIndex((h) => COMMITTEE_HEADERS.has(h))
  const countryAt = headerNames.findIndex((h) => COUNTRY_HEADERS.has(h))

  if (committeeAt !== -1 && countryAt !== -1) {
    const byCommittee = new Map<string, string[]>()
    /*
      Repeats are reported and skipped, exactly as they are in the wide form.

      Without this a sheet that names the same pair twice — trivially produced
      by sorting a database export, or by pasting a column in twice — reached
      the importer with a duplicate in the list. The importer creates each
      country in turn against a snapshot of what already exists, so the second
      copy hit the (committeeId, country) unique constraint and came back as a
      409 phrased in terms of ALLOCATIONS, having already committed the
      committees earlier in the file. A duplicated row is an author's slip, not
      a half-finished import.
    */
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

  /* ---------------------------------------------------------------------
     Wide form — one column per committee.
     --------------------------------------------------------------------- */
  const columns: ParsedMatrix[] = []
  const seenHeaders = new Set<string>()

  header.forEach((name, columnIndex) => {
    if (!name) return // an unlabelled column is a spreadsheet artefact, not data

    if (seenHeaders.has(norm(name))) {
      issues.push({ row: 1, column: name, reason: `"${name}" is used as a heading twice.` })
      return
    }
    seenHeaders.add(norm(name))

    const countries: string[] = []
    const seen = new Set<string>()

    body.forEach((row, index) => {
      const country = clean(row[columnIndex])
      if (!country) return // short columns are normal; a gap is not an error
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
