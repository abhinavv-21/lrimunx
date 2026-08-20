import { LedgerCategory, PriceTier } from '@prisma/client'
import { PRICE_TIERS, type TierPrices } from './conference.js'

/**
 * The arithmetic behind the finance screen, kept apart from the query that
 * feeds it so it can be tested without a database.
 *
 * Two sources of money meet here and they are counted differently on purpose:
 *
 *   Registration income  is what delegates actually paid, taken from
 *                        Registration.amountPaid and grouped by tier. It is
 *                        never copied into the ledger, because then the
 *                        conference would have two numbers for the same money.
 *
 *   Ledger entries       are everything typed by hand — the venue invoice, a
 *                        sponsor's cheque, the printing bill.
 *
 * Both are whole Nepali rupees.
 */

export interface TierIncomeRow {
  tier: PriceTier
  count: number
  total: number
  /** What the tier is configured to charge, so a shortfall is visible next to it. */
  configuredPrice: number
  /** count × configuredPrice, i.e. what these delegates were supposed to pay. */
  expected: number
}

export interface LedgerCategoryRow {
  category: LedgerCategory
  credit: number
  debit: number
}

export interface SummaryInput {
  /** One row per tier that has at least one paid registration. */
  registrationGroups: Array<{ priceTier: PriceTier | null; count: number; total: number | null }>
  /** Registrations that count as income but have no tier recorded yet. */
  unrecorded: number
  ledgerGroups: Array<{ category: LedgerCategory; credit: number | null; debit: number | null }>
  prices: TierPrices
}

export interface LedgerSummary {
  registrations: {
    tiers: TierIncomeRow[]
    /** Paid registrations still waiting for someone to record a tier. */
    unrecorded: number
    count: number
    collected: number
    expected: number
    /** expected − collected. Positive means money was promised and not received. */
    shortfall: number
  }
  ledger: {
    byCategory: LedgerCategoryRow[]
    credit: number
    debit: number
  }
  net: {
    income: number
    expense: number
    balance: number
  }
}

export function summariseLedger(input: SummaryInput): LedgerSummary {
  const byTier = new Map(
    input.registrationGroups
      .filter((row): row is { priceTier: PriceTier; count: number; total: number | null } =>
        row.priceTier !== null,
      )
      .map((row) => [row.priceTier, row]),
  )

  // Every tier appears, including the ones nobody has been put on. A finance
  // screen that hides the empty rows makes "no alumni signed up" look the same
  // as "alumni pricing was never set up".
  const tiers: TierIncomeRow[] = PRICE_TIERS.map((tier) => {
    const row = byTier.get(tier)
    const count = row?.count ?? 0
    const configuredPrice = input.prices[tier]

    return {
      tier,
      count,
      total: row?.total ?? 0,
      configuredPrice,
      expected: count * configuredPrice,
    }
  })

  const collected = tiers.reduce((sum, row) => sum + row.total, 0)
  const expected = tiers.reduce((sum, row) => sum + row.expected, 0)
  const registrationCount = tiers.reduce((sum, row) => sum + row.count, 0)

  const byCategory: LedgerCategoryRow[] = input.ledgerGroups.map((row) => ({
    category: row.category,
    credit: row.credit ?? 0,
    debit: row.debit ?? 0,
  }))

  const credit = byCategory.reduce((sum, row) => sum + row.credit, 0)
  const debit = byCategory.reduce((sum, row) => sum + row.debit, 0)

  const income = collected + credit

  return {
    registrations: {
      tiers,
      unrecorded: input.unrecorded,
      count: registrationCount,
      collected,
      expected,
      shortfall: expected - collected,
    },
    ledger: { byCategory, credit, debit },
    net: { income, expense: debit, balance: income - debit },
  }
}
