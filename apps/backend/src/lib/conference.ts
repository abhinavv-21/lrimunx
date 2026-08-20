import { PriceTier } from '@prisma/client'
import { ApiError } from './errors.js'
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

/**
 * PREPARING before the doors open, RUNNING for the three days, ENDED once the
 * secretariat closes it.
 *
 * The path through is PREPARING → RUNNING → ENDED, and back from ENDED to
 * RUNNING through /conference/reopen, which is the owner's to do. There is no
 * way back to PREPARING short of a reset: "we have not started" is a claim
 * about a conference with no check-ins behind it, and once there are, saying it
 * again would be a lie the hub told on every screen.
 */
export type ConferenceState = 'PREPARING' | 'RUNNING' | 'ENDED'

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
  /**
   * The day the conference is on, or the day it finished on once ENDED.
   * Meaningless only while PREPARING, when nothing has happened on any day yet.
   */
  activeDay: number
  days: typeof CONFERENCE_DAYS
}

/**
 * Parses the stored state. Written out rather than cast, because Setting holds
 * strings and an unrecognised one has to land somewhere: PREPARING is the only
 * safe guess, since it is the state that grants nothing and blocks nothing.
 *
 * ENDED has to be named here explicitly. Fall through to PREPARING and an ended
 * conference would silently reopen itself on the very next read.
 */
export function parseConferenceState(stored: string | undefined): ConferenceState {
  if (stored === 'RUNNING') return 'RUNNING'
  if (stored === 'ENDED') return 'ENDED'
  return 'PREPARING'
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
    state: parseConferenceState(stored.get(CONFERENCE_STATE_KEY)),
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
 * The day a check-in, a logistics request or an unqualified attendance summary
 * lands on when the caller did not name one: the active day while the
 * conference is running, and the first day before it starts, because a
 * rehearsal check-in has to go somewhere.
 *
 * ENDED keeps the last active day rather than dropping back to day 1. Writes
 * are refused by then (see assertConferenceOpen), so what this actually decides
 * is which day the attendance screen opens on the morning after, and that is
 * day 3, the one people are still arguing about, not day 1.
 */
export function defaultDay(mode: ConferenceMode): number {
  return mode.state === 'PREPARING' ? FIRST_DAY : mode.activeDay
}

/**
 * Refuses a write that would change the record after the conference is over.
 *
 * Attendance and logistics are the two things this guards, because they are the
 * two the hub writes during the three days and the two an audit would ask about
 * afterwards. A check-in backdated a week later is indistinguishable from one
 * made at the desk, so once the secretariat ends the conference, both go
 * read-only until an owner reopens it.
 *
 * 409 rather than 403: the caller has every permission they need, and the same
 * request would have worked yesterday. What is wrong is the state, so the
 * message says which state and how to leave it.
 */
export function assertConferenceOpen(mode: ConferenceMode): void {
  if (mode.state !== 'ENDED') return
  throw ApiError.conflict(
    'The conference has ended, so attendance and logistics are read-only. The hub owner can reopen it.',
  )
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
