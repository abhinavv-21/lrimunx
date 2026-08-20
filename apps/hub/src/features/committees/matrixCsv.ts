/**
 * Turning a pasted list of countries into something POST /matrix/import will
 * accept for one committee and no other.
 *
 * The endpoint decides which room a column belongs to from its heading, so a
 * sheet with a single heading is the whole scoping mechanism: one column named
 * after this committee cannot reach any other. That is why there is no
 * per-committee import endpoint and why this does not need one.
 */

/** Comma or tab — a spreadsheet row pastes as one, a CSV row as the other. */
const CELL = /[,\t]/

/**
 * The whitespace a clipboard brings along, folded. JavaScript's \s covers the
 * non-breaking space a spreadsheet leaves behind, so a cell padded with one
 * still matches a committee code and still counts as a country, not a blank.
 */
function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function quote(field: string): string {
  return `"${field.replace(/"/g, '""')}"`
}

/**
 * The countries in a paste, in the order they were typed.
 *
 * One country per line is the shape that comes off a spreadsheet column, but a
 * row of comma- or tab-separated names reads the same way. Cells repeating the
 * committee's own code are dropped, so a two-column paste — the code beside
 * each country — and a column pasted with its heading still attached both come
 * out as a plain list.
 *
 * Duplicates are left in. The API names them back as issues, and quietly
 * folding them here would hide a mistake in the sheet.
 */
export function pastedCountries(paste: string, committeeCode: string): string[] {
  const code = clean(committeeCode).toLowerCase()

  return paste
    .split(/\r\n|\r|\n/)
    .flatMap((line) => line.split(CELL))
    .map(clean)
    .filter((cell) => cell.length > 0 && cell.toLowerCase() !== code)
}

/** A one-column CSV headed with the committee's code. */
export function scopedMatrixCsv(committeeCode: string, countries: string[]): string {
  return [clean(committeeCode), ...countries].map(quote).join('\n')
}
