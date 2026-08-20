import { describe, expect, it } from 'vitest'
import { LedgerCategory, PriceTier } from '@prisma/client'
import { DEFAULT_TIER_PRICES, PRICE_TIERS, parsePrice, type TierPrices } from './conference.js'
import { summariseLedger, type SummaryInput } from './ledger.js'

const prices: TierPrices = {
  [PriceTier.BASE]: 2500,
  [PriceTier.INTERNAL]: 1200,
  [PriceTier.ALUMNI]: 2000,
  [PriceTier.DISCOUNT]: 1500,
}

function input(overrides: Partial<SummaryInput> = {}): SummaryInput {
  return {
    registrationGroups: [],
    unrecorded: 0,
    ledgerGroups: [],
    prices,
    ...overrides,
  }
}

describe('tier pricing', () => {
  it('keeps a default for every tier the enum has', () => {
    for (const tier of PRICE_TIERS) {
      expect(DEFAULT_TIER_PRICES[tier]).toBeGreaterThan(0)
    }
    expect(Object.keys(DEFAULT_TIER_PRICES)).toHaveLength(Object.keys(PriceTier).length)
  })

  it('charges LRI students least and the public most', () => {
    const { BASE, INTERNAL, ALUMNI, DISCOUNT } = DEFAULT_TIER_PRICES
    expect(INTERNAL).toBeLessThan(DISCOUNT)
    expect(DISCOUNT).toBeLessThan(ALUMNI)
    expect(ALUMNI).toBeLessThan(BASE)
  })

  it('reads a stored price back as the integer it was written as', () => {
    expect(parsePrice('1800', 2500)).toBe(1800)
    expect(parsePrice('0', 2500)).toBe(0)
  })

  it('falls back rather than throwing on anything it cannot use', () => {
    for (const stored of [undefined, '', 'free', '1800.50', '-100', '1e9', '99999999']) {
      expect(parsePrice(stored, 2500)).toBe(2500)
    }
  })
})

describe('summariseLedger — registration income', () => {
  it('reports every tier, including the ones nobody was put on', () => {
    const summary = summariseLedger(
      input({ registrationGroups: [{ priceTier: PriceTier.BASE, count: 3, total: 7500 }] }),
    )

    expect(summary.registrations.tiers.map((row) => row.tier)).toEqual([...PRICE_TIERS])

    const alumni = summary.registrations.tiers.find((row) => row.tier === PriceTier.ALUMNI)
    expect(alumni).toMatchObject({ count: 0, total: 0, expected: 0, configuredPrice: 2000 })
  })

  it('totals count and money per tier and across all of them', () => {
    const summary = summariseLedger(
      input({
        registrationGroups: [
          { priceTier: PriceTier.BASE, count: 10, total: 25_000 },
          { priceTier: PriceTier.INTERNAL, count: 6, total: 7_200 },
          { priceTier: PriceTier.DISCOUNT, count: 2, total: 3_000 },
        ],
      }),
    )

    expect(summary.registrations.count).toBe(18)
    expect(summary.registrations.collected).toBe(35_200)
    expect(summary.registrations.expected).toBe(10 * 2500 + 6 * 1200 + 2 * 1500)
    expect(summary.registrations.shortfall).toBe(0)
  })

  it('surfaces the gap when delegates paid less than the tier asked for', () => {
    const summary = summariseLedger(
      input({ registrationGroups: [{ priceTier: PriceTier.BASE, count: 4, total: 9_000 }] }),
    )

    expect(summary.registrations.expected).toBe(10_000)
    expect(summary.registrations.collected).toBe(9_000)
    expect(summary.registrations.shortfall).toBe(1_000)
  })

  it('goes negative on the shortfall when more came in than was asked for', () => {
    const summary = summariseLedger(
      input({ registrationGroups: [{ priceTier: PriceTier.BASE, count: 1, total: 3_000 }] }),
    )
    expect(summary.registrations.shortfall).toBe(-500)
  })

  it('treats a null sum from an empty group as zero rather than NaN', () => {
    const summary = summariseLedger(
      input({ registrationGroups: [{ priceTier: PriceTier.ALUMNI, count: 0, total: null }] }),
    )
    expect(summary.registrations.collected).toBe(0)
    expect(Number.isNaN(summary.net.balance)).toBe(false)
  })

  it('keeps untiered payments out of the tier rows but visible on their own', () => {
    const summary = summariseLedger(
      input({
        registrationGroups: [
          { priceTier: null, count: 5, total: 12_500 },
          { priceTier: PriceTier.BASE, count: 1, total: 2_500 },
        ],
        unrecorded: 5,
      }),
    )

    expect(summary.registrations.count).toBe(1)
    expect(summary.registrations.collected).toBe(2_500)
    expect(summary.registrations.unrecorded).toBe(5)
  })
})

describe('summariseLedger — manual entries and the net position', () => {
  it('adds credit to income and debit to expense, and nets the two', () => {
    const summary = summariseLedger(
      input({
        registrationGroups: [{ priceTier: PriceTier.BASE, count: 20, total: 50_000 }],
        ledgerGroups: [
          { category: LedgerCategory.SPONSORSHIP, credit: 30_000, debit: 0 },
          { category: LedgerCategory.VENUE, credit: 0, debit: 45_000 },
          { category: LedgerCategory.FOOD, credit: 0, debit: 22_000 },
        ],
      }),
    )

    expect(summary.ledger.credit).toBe(30_000)
    expect(summary.ledger.debit).toBe(67_000)
    expect(summary.net.income).toBe(80_000)
    expect(summary.net.expense).toBe(67_000)
    expect(summary.net.balance).toBe(13_000)
  })

  it('reports a loss as a negative balance rather than clamping it', () => {
    const summary = summariseLedger(
      input({ ledgerGroups: [{ category: LedgerCategory.VENUE, credit: 0, debit: 40_000 }] }),
    )
    expect(summary.net.balance).toBe(-40_000)
  })

  it('reads nulls from an aggregate as zero', () => {
    const summary = summariseLedger(
      input({ ledgerGroups: [{ category: LedgerCategory.MISC, credit: null, debit: null }] }),
    )
    expect(summary.ledger.byCategory).toEqual([{ category: LedgerCategory.MISC, credit: 0, debit: 0 }])
    expect(summary.net.balance).toBe(0)
  })

  it('balances to zero on a conference nobody has entered anything for', () => {
    const summary = summariseLedger(input())
    expect(summary.net).toEqual({ income: 0, expense: 0, balance: 0 })
    expect(summary.registrations.tiers).toHaveLength(PRICE_TIERS.length)
  })

  it('never double counts registration income as a ledger credit', () => {
    // The REGISTRATION category exists for a cash payment somebody enters by
    // hand. It must be added to the tier totals, not confused with them.
    const summary = summariseLedger(
      input({
        registrationGroups: [{ priceTier: PriceTier.BASE, count: 2, total: 5_000 }],
        ledgerGroups: [{ category: LedgerCategory.REGISTRATION, credit: 2_500, debit: 0 }],
      }),
    )

    expect(summary.registrations.collected).toBe(5_000)
    expect(summary.ledger.credit).toBe(2_500)
    expect(summary.net.income).toBe(7_500)
  })
})
