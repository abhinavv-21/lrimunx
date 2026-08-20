import type { LedgerCategory, PriceTier } from '@/types/api'

/**
 * The money vocabulary for the budget screen and the payment dialog.
 *
 * Every figure the API sends is a whole number of Nepali rupees, so nothing
 * here rounds decimals into existence. Grouping is the South Asian one —
 * 2,50,000 rather than 250,000 — because that is how a treasurer in Kathmandu
 * reads a total off a bank slip.
 */

const GROUPED = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/**
 * Shown when there is no number to show — a query that has not resolved, or a
 * field the API left null. Never shown for a real zero: `formatMoney(0)` is
 * "Rs 0", because "nothing was collected" and "nobody has looked yet" are
 * different facts and the screen must not blur them.
 */
export const NO_FIGURE = '—'

export function formatMoney(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return NO_FIGURE

  const rounded = Math.round(amount)
  // U+2212, not a hyphen: it lines up with the digits in tabular numerals.
  const sign = rounded < 0 ? '−' : ''
  return `${sign}Rs ${GROUPED.format(Math.abs(rounded))}`
}

export const PRICE_TIERS: readonly PriceTier[] = ['BASE', 'INTERNAL', 'ALUMNI', 'DISCOUNT']

export const TIER_LABELS: Record<PriceTier, string> = {
  BASE: 'Base',
  INTERNAL: 'Internal',
  ALUMNI: 'Alumni',
  DISCOUNT: 'Discount',
}

/** What each tier means, in the words the secretariat uses for it. */
export const TIER_MEANING: Record<PriceTier, string> = {
  BASE: 'Everyone outside the categories below',
  INTERNAL: "LRI's own students",
  ALUMNI: 'Delegates who have attended before',
  DISCOUNT: 'One flat concession rate, whatever the reason',
}

export const CATEGORY_LABELS: Record<LedgerCategory, string> = {
  REGISTRATION: 'Registration',
  SPONSORSHIP: 'Sponsorship',
  VENUE: 'Venue',
  FOOD: 'Food',
  PRINTING: 'Printing',
  AWARDS: 'Awards',
  TRANSPORT: 'Transport',
  HOSPITALITY: 'Hospitality',
  MARKETING: 'Marketing',
  MISC: 'Miscellaneous',
}

export const LEDGER_CATEGORIES = Object.keys(CATEGORY_LABELS) as LedgerCategory[]
