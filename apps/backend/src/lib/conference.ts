import { PriceTier } from '@prisma/client'
import { prisma } from './prisma.js'
import type { PrismaTransaction } from './prisma.js'

/**
 * Conference-level configuration that lives in the Setting key/value table:
 * the four price tiers, whether the conference is running, and which day it is
 * on.
 *
 * All of it goes through here rather than being read inline, because Setting
 * stores strings and every one of these is really a number or an enum. One
 * module parses them, one module holds the defaults, and a value someone typed
 * into the database by hand can only be wrong in one place.
 */

/** 21, 22 and 23 November 2026. */
export const CONFERENCE_DAYS = [
  { day: 1, date: '2026-11-21' },
  { day: 2, date: '2026-11-22' },
  { day: 3, date: '2026-11-23' },
] as const

export const FIRST_DAY = 1
export const LAST_DAY = CONFERENCE_DAYS.length

export type ConferenceState = 'PREPARING' | 'RUNNING'

export const PRICE_TIERS: readonly PriceTier[] = [
  PriceTier.BASE,
  PriceTier.INTERNAL,
  PriceTier.ALUMNI,
  PriceTier.DISCOUNT,
]

export type TierPrices = Record<PriceTier, number>

/**
 * Working figures in whole Nepali rupees, used until the secretariat sets its
 * own. They are deliberately ordered BASE > ALUMNI > DISCOUNT > INTERNAL: LRI's
 * own students pay the least because the school is already carrying the venue,
 * and returning delegates get a smaller concession than a hardship case.
 */
export const DEFAULT_TIER_PRICES: TierPrices = {
  [PriceTier.BASE]: 2500,
  [PriceTier.INTERNAL]: 1200,
  [PriceTier.ALUMNI]: 2000,
  [PriceTier.DISCOUNT]: 1500,
}

/** Nobody is charging six figures for a school MUN; this catches a typo, not a policy. */
export const MAX_TIER_PRICE = 100_000

export const PRICE_SETTING_PREFIX = 'price.'
export const CONFERENCE_STATE_KEY = 'conference.state'
export const CONFERENCE_DAY_KEY = 'conference.day'

export function priceSettingKey(tier: PriceTier): string {
  return `${PRICE_SETTING_PREFIX}${tier}`
}

export function isConferenceDay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= FIRST_DAY && value <= LAST_DAY
}

/**
 * Parses a stored string back into a price, falling back to the default rather
 * than throwing. A settings row can only be written through the API, which
 * validates; a row that is somehow unreadable should not take the whole finance
 * screen down with it.
 */
export function parsePrice(stored: string | undefined, fallback: number): number {
  // Trim and test for emptiness before Number(), which reads '' and '   ' as 0.
  // A blank row means the price was never set, not that the conference is free.
  if (stored === undefined || stored.trim() === '') return fallback
  const parsed = Number(stored)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_TIER_PRICE) return fallback
  return parsed
}

export interface ConferenceMode {
  state: ConferenceState
  /** The day the conference is on. Meaningful only while RUNNING. */
  activeDay: number
  days: typeof CONFERENCE_DAYS
}

async function readKeys(keys: string[], client: PrismaTransaction | typeof prisma): Promise<Map<string, string>> {
  const rows = await client.setting.findMany({ where: { key: { in: keys } } })
  return new Map(rows.map((row) => [row.key, row.value]))
}

export async function readTierPrices(
  client: PrismaTransaction | typeof prisma = prisma,
): Promise<TierPrices> {
  const stored = await readKeys(PRICE_TIERS.map(priceSettingKey), client)

  return Object.fromEntries(
    PRICE_TIERS.map((tier) => [
      tier,
      parsePrice(stored.get(priceSettingKey(tier)), DEFAULT_TIER_PRICES[tier]),
    ]),
  ) as TierPrices
}

export async function writeTierPrices(
  prices: Partial<TierPrices>,
  client: PrismaTransaction | typeof prisma = prisma,
): Promise<void> {
  for (const [tier, amount] of Object.entries(prices)) {
    if (amount === undefined) continue
    const key = priceSettingKey(tier as PriceTier)
    await client.setting.upsert({
      where: { key },
      update: { value: String(amount) },
      create: { key, value: String(amount) },
    })
  }
}

export async function readConferenceMode(
  client: PrismaTransaction | typeof prisma = prisma,
): Promise<ConferenceMode> {
  const stored = await readKeys([CONFERENCE_STATE_KEY, CONFERENCE_DAY_KEY], client)

  const day = Number(stored.get(CONFERENCE_DAY_KEY))

  return {
    state: stored.get(CONFERENCE_STATE_KEY) === 'RUNNING' ? 'RUNNING' : 'PREPARING',
    activeDay: isConferenceDay(day) ? day : FIRST_DAY,
    days: CONFERENCE_DAYS,
  }
}

export async function writeConferenceMode(
  changes: { state?: ConferenceState; activeDay?: number },
  client: PrismaTransaction | typeof prisma = prisma,
): Promise<ConferenceMode> {
  const writes: Array<[string, string]> = []
  if (changes.state !== undefined) writes.push([CONFERENCE_STATE_KEY, changes.state])
  if (changes.activeDay !== undefined) writes.push([CONFERENCE_DAY_KEY, String(changes.activeDay)])

  for (const [key, value] of writes) {
    await client.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  }

  return readConferenceMode(client)
}

/**
 * The day a check-in or a logistics request lands on when the caller did not
 * name one: the active day while the conference is running, and the first day
 * before it starts, because a rehearsal check-in has to go somewhere.
 */
export function defaultDay(mode: ConferenceMode): number {
  return mode.state === 'RUNNING' ? mode.activeDay : FIRST_DAY
}

/**
 * The conference dates and venue the secretariat typed into settings, for the
 * emails that have to state them.
 *
 * Every field is nullable and stays nullable. The allocation announcement drops
 * the line rather than filling it in with a guess: a delegate told the wrong
 * weekend is worse off than one told nothing, who asks.
 */
export async function readConferenceWhen(
  client: PrismaTransaction | typeof prisma = prisma,
): Promise<{ startsOn: string | null; endsOn: string | null; venue: string | null }> {
  const stored = await readKeys(['startsOn', 'endsOn', 'venue'], client)
  const value = (key: string) => stored.get(key)?.trim() || null

  return { startsOn: value('startsOn'), endsOn: value('endsOn'), venue: value('venue') }
}
