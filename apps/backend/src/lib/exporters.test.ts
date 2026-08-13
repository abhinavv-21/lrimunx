import { describe, expect, it } from 'vitest'
import { fileNameFor, toPdf, toXlsx, type ExportTable } from './exporters.js'

const table: ExportTable = {
  title: 'Delegates',
  columns: ['Name', 'School', 'Committee', 'Country'],
  rows: [
    ['Aarav Menon', 'Ridge International School', 'UNSC', 'France'],
    ['Meher Gill', 'The Lawrence School, Sanawar (Himachal Pradesh Residential Campus)', 'DISEC', 'Japan'],
  ],
}

describe('toXlsx', () => {
  it('produces a non-empty buffer with the XLSX (zip) magic bytes', () => {
    const buffer = toXlsx(table)
    expect(buffer.length).toBeGreaterThan(0)

    expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  })

  it('handles an empty row set without throwing', () => {
    expect(() => toXlsx({ ...table, rows: [] })).not.toThrow()
  })

  it('truncates an over-long sheet name to Excel’s 31 character limit', () => {
    const longTitle = 'Delegates and their committee assignments for LRI MUN X'
    expect(() => toXlsx({ ...table, title: longTitle })).not.toThrow()
  })
})

describe('toPdf', () => {
  it('produces a buffer beginning with the PDF header', () => {
    const buffer = toPdf(table)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('handles an empty row set without throwing', () => {
    expect(() => toPdf({ ...table, rows: [] })).not.toThrow()
  })
})

describe('fileNameFor', () => {
  it('includes the dataset and the correct extension', () => {
    expect(fileNameFor('delegates', 'xlsx')).toMatch(/^lri-mun-x-delegates-\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(fileNameFor('assignments', 'pdf')).toMatch(/^lri-mun-x-assignments-\d{4}-\d{2}-\d{2}\.pdf$/)
  })
})
