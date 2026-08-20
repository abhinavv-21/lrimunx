import { describe, expect, it } from 'vitest'
import { netOf, tierRows } from './summary'
import type { LedgerSummary } from '@/types/api'

function summaryWith(tiers: LedgerSummary['registrations']['tiers']): LedgerSummary {
  return {
    registrations: { tiers, unrecorded: 0, count: 0, collected: 0, expected: 0, shortfall: 0 },
    ledger: { byCategory: [], credit: 0, debit: 0 },
    net: { income: 0, expense: 0, balance: 0 },
  }
}

describe('tierRows', () => {
  it('reads the shortfall as what was promised less what arrived', () => {
    const rows = tierRows(
      summaryWith([{ tier: 'BASE', count: 4, total: 9000, configuredPrice: 2500, expected: 10000 }]),
    )

    expect(rows[0]).toEqual({
      tier: 'BASE',
      count: 4,
      rate: 2500,
      collected: 9000,
      expected: 10000,
      shortfall: 1000,
    })
  })

  it('goes negative when delegates paid over the rate', () => {
    const rows = tierRows(
      summaryWith([{ tier: 'ALUMNI', count: 2, total: 4500, configuredPrice: 2000, expected: 4000 }]),
    )

    expect(rows[0]?.shortfall).toBe(-500)
  })

  it('keeps a tier nobody is on, with a zero rather than a gap', () => {
    const rows = tierRows(
      summaryWith([{ tier: 'DISCOUNT', count: 0, total: 0, configuredPrice: 1500, expected: 0 }]),
    )

    expect(rows[0]).toMatchObject({ count: 0, collected: 0, expected: 0, shortfall: 0, rate: 1500 })
  })

  it('keeps the tiers in the order the API sent them', () => {
    const rows = tierRows(
      summaryWith([
        { tier: 'BASE', count: 1, total: 2500, configuredPrice: 2500, expected: 2500 },
        { tier: 'INTERNAL', count: 3, total: 3600, configuredPrice: 1200, expected: 3600 },
      ]),
    )

    expect(rows.map((row) => row.tier)).toEqual(['BASE', 'INTERNAL'])
  })
})

describe('netOf', () => {
  it('nets the filtered credit against the filtered debit', () => {
    expect(netOf({ credit: 120000, debit: 45000 })).toBe(75000)
  })

  it('is negative when the filter is all spending', () => {
    expect(netOf({ credit: 0, debit: 32000 })).toBe(-32000)
  })

  it('is zero when the books balance, and says so as a zero', () => {
    expect(netOf({ credit: 5000, debit: 5000 })).toBe(0)
  })
})
