import { describe, expect, it } from 'vitest'
import { pastedCountries, scopedMatrixCsv } from './matrixCsv'

describe('reading a paste', () => {
  it('takes one country per line', () => {
    expect(pastedCountries('France\nIndia\nBrazil', 'UNSC')).toEqual(['France', 'India', 'Brazil'])
  })

  it('reads a comma-separated row as several countries', () => {
    expect(pastedCountries('France, India, Brazil', 'UNSC')).toEqual(['France', 'India', 'Brazil'])
  })

  it('reads a spreadsheet paste, where the cells arrive tab-separated', () => {
    expect(pastedCountries('France\tIndia\nBrazil\tChina', 'UNSC')).toEqual([
      'France',
      'India',
      'Brazil',
      'China',
    ])
  })

  it('drops the committee code, so a two-column paste lands as a plain list', () => {
    expect(pastedCountries('UNSC,France\nUNSC,India', 'UNSC')).toEqual(['France', 'India'])
  })

  it('drops the column heading when it was pasted along with the column', () => {
    expect(pastedCountries('unsc\nFrance\nIndia', 'UNSC')).toEqual(['France', 'India'])
  })

  it('ignores blank lines, trailing separators and stray whitespace', () => {
    expect(pastedCountries('  France  ,\n\n\tIndia\r\n', 'UNSC')).toEqual(['France', 'India'])
  })

  it('keeps duplicates, so the API can name them back as issues', () => {
    expect(pastedCountries('France\nFrance', 'UNSC')).toEqual(['France', 'France'])
  })

  it('reads nothing out of an empty paste', () => {
    expect(pastedCountries('', 'UNSC')).toEqual([])
    expect(pastedCountries('   \n\n', 'UNSC')).toEqual([])
  })
})

describe('building the CSV', () => {
  it('heads a single column with the committee code, which is the whole scoping', () => {
    expect(scopedMatrixCsv('UNSC', ['France', 'India'])).toBe('"UNSC"\n"France"\n"India"')
  })

  it('quotes a country that carries a comma, so it stays one field', () => {
    expect(scopedMatrixCsv('UNSC', ['Korea, Republic of'])).toBe('"UNSC"\n"Korea, Republic of"')
  })

  it('doubles a quotation mark rather than letting it open a field', () => {
    expect(scopedMatrixCsv('UNSC', ['Côte d"Ivoire'])).toBe('"UNSC"\n"Côte d""Ivoire"')
  })

  it('names one committee and only one, whatever the paste held', () => {
    const csv = scopedMatrixCsv('DISEC', pastedCountries('DISEC,France\nUNSC\nIndia', 'DISEC'))

    // "UNSC" survives as a country, not as a second column: a single heading
    // means the import cannot touch a second room.
    expect(csv.split('\n')[0]).toBe('"DISEC"')
    expect(csv.split('\n')).toHaveLength(4)
  })
})
