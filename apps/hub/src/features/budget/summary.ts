import type { LedgerSummary, PriceTier } from '@/types/api'

/**
 * The two sums the finance screen does for itself.
 *
 * Everything else on the page is a figure the API already aggregated in SQL.
 * These two are not: the summary carries a shortfall for registrations as a
 * whole but not per tier, and the ledger totals arrive as a credit and a debit
 * that still have to be netted off.
 */

export interface TierRow {
  tier: PriceTier
  count: number

  rate: number
  collected: number
  expected: number

  /** Above zero means these delegates owe money; below means they overpaid. */
  shortfall: number
}

export function tierRows(summary: LedgerSummary): TierRow[] {
  return summary.registrations.tiers.map((row) => ({
    tier: row.tier,
    count: row.count,
    rate: row.configuredPrice,
    collected: row.total,
    expected: row.expected,
    shortfall: row.expected - row.total,
  }))
}

/** What the visible filter is worth: money in, less money out. */
export function netOf(totals: { credit: number; debit: number }): number {
  return totals.credit - totals.debit
}
