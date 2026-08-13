import { describe, expect, it } from 'vitest'
import { filterOptions, fold, foldSearch } from './text'

const NBSP = String.fromCharCode(0x00a0)
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)
const BOM = String.fromCharCode(0xfeff)

describe('fold — equality', () => {
  it('treats a spreadsheet non-breaking space as an ordinary space', () => {
    expect(fold(`Korea,${NBSP}Republic of`)).toBe('korea, republic of')
  })

  it('strips zero-width characters and the byte order mark', () => {
    expect(fold(`Fran${ZERO_WIDTH_SPACE}ce`)).toBe('france')
    expect(fold(`${BOM}Peru`)).toBe('peru')
  })

  it('collapses runs of whitespace and trims', () => {
    expect(fold('  United   States \n of  America ')).toBe('united states of america')
  })

  it('does not eat a literal s', () => {
    expect(fold('Russia')).toBe('russia')
    expect(fold('Switzerland')).toBe('switzerland')
  })

  it('keeps accents, so it agrees with the server', () => {
    expect(fold('Cote dIvoire')).not.toBe(fold('Côte dIvoire'))
  })
})

describe('foldSearch — matching only', () => {
  it('ignores accents so an unaccented query still finds the country', () => {
    expect(foldSearch('Côte dIvoire')).toBe('cote divoire')
    expect(foldSearch('Curaçao')).toBe('curacao')
    expect(foldSearch('Türkiye')).toBe('turkiye')
  })

  it('still applies the invisible-character cleaning', () => {
    expect(foldSearch(`Perú${ZERO_WIDTH_SPACE}`)).toBe('peru')
  })
})

describe('filterOptions', () => {
  const options = [
    { value: 'a', label: 'Chad' },
    { value: 'b', label: 'Chile' },
    { value: 'c', label: 'France', hint: 'Aarav Menon' },
    { value: 'd', label: "Côte d'Ivoire" },
    { value: 'e', label: 'Czechia', hint: 'full' },
  ]
  const labels = (query: string) => filterOptions(options, query).map((o) => o.label)

  it('returns every option, in order, for an empty query', () => {
    expect(labels('')).toEqual(['Chad', 'Chile', 'France', "Côte d'Ivoire", 'Czechia'])
  })

  it('ranks label prefixes above label substrings', () => {
    expect(labels('ch')).toEqual(['Chad', 'Chile', 'Czechia'])
  })

  it('finds an accented country from an unaccented query', () => {
    expect(labels('cote')).toEqual(["Côte d'Ivoire"])
  })

  it('searches hints, which is how you find who holds a country', () => {
    expect(labels('aarav')).toEqual(['France'])
  })

  it('ranks label matches above hint matches', () => {
    expect(labels('f')[0]).toBe('France')
  })

  it('returns nothing when nothing matches', () => {
    expect(labels('zzzz')).toEqual([])
  })

  it('is case-insensitive in both directions', () => {
    expect(labels('CHAD')).toEqual(['Chad'])
  })
})
