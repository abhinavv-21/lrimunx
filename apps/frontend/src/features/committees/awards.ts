/**
 * The awards LRI MUN gives, in ceremony order.
 *
 * Offered as suggestions, never enforced — the title field accepts anything so
 * a committee can add one of its own. This list must stay in step with
 * AWARD_RANKS on the backend, which is what actually decides the order: a title
 * spelled differently here would simply sort to the end.
 */
export const STANDARD_AWARDS = [
  'Best Delegate',
  'Outstanding Delegate',
  'Special Mention',
  'Best Position Paper',
] as const

/** What a committee gets when the secretariat seeds a fresh ceremony. */
export const DEFAULT_AWARD_SET = STANDARD_AWARDS

/** Shared id so every title field on the page points at one datalist. */
export const AWARD_TITLES_LIST_ID = 'award-titles'
