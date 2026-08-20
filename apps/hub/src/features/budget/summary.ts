import { CATEGORY_SUGGESTIONS } from './money'
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

/**
 * What to offer in a category box: everything the ledger is already using,
 * plus the suggestions nobody has reached for yet.
 *
 * Built from the summary because that is where every distinct category in the
 * books arrives already — grouped, so a category that exists cannot be missing
 * from the list. Folded by case so a suggestion and a stored spelling of the
 * same word appear once.
 */
export function categoryChoices(summary: LedgerSummary | undefined): string[] {
  const byFold = new Map<string, string>()

  for (const row of summary?.ledger.byCategory ?? []) byFold.set(row.category.toLowerCase(), row.category)
  for (const suggestion of CATEGORY_SUGGESTIONS) {
    if (!byFold.has(suggestion.toLowerCase())) byFold.set(suggestion.toLowerCase(), suggestion)
  }

  return [...byFold.values()].sort((a, b) => a.localeCompare(b))
}
