/**
 * Referral codes, and the one function that decides whether two of them are the
 * same code.
 *
 * A delegate types the code into a free-text box on a phone, from a poster, a
 * screenshot or something a friend said out loud. `ridge-munsoc`, `RIDGE MUNSOC`,
 * ` Ridge-Munsoc ` and `RIDGE–MUNSOC` with an en-dash are all one person's code
 * and all four arrive. Matching them literally would credit the referrer for
 * whichever spelling they happened to publish and silently lose the rest, which
 * is exactly the number this feature exists to get right.
 *
 * So the typed answer is stored as typed — it is what the applicant actually
 * said, and it is evidence — and this produces the key it is matched on. Both
 * are kept: `Registration.referralCode` is the raw text and `referralCodeId` is
 * the interpretation. When they disagree, the raw text is the one that is true.
 */

/** Zero-width joiners, non-joiners and the byte-order mark. */
const INVISIBLE = /[\u200B-\u200D\uFEFF]/g

/**
 * Hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar.
 *
 * A phone keyboard offers an en dash where a poster shows a hyphen, and NFKC
 * does not fold one into the other. Without this, RIDGE–MUNSOC and RIDGE-MUNSOC
 * are two different codes that look identical on screen.
 */
const DASHES = /[\u2010-\u2015]/g

/**
 * The readable form: upper case, no whitespace, one kind of dash.
 *
 * This is what goes on a poster and what the hub prints. The hyphen survives
 * because `RIDGE-MUNSOC` is easier to read back than `RIDGEMUNSOC`, and whoever
 * creates the code decides whether it has one.
 */
export function referralDisplayCode(input: string | null | undefined): string | null {
  if (input == null) return null

  const code = input
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(DASHES, '-')
    .replace(/\s+/g, '')
    .toUpperCase()

  return code === '' ? null : code
}

/**
 * The key two codes are compared on: letters and digits, nothing else.
 *
 * Separators go entirely, which is the whole point. Someone reading
 * `RIDGE-MUNSOC` off a poster types `ridge munsoc`, `RIDGEMUNSOC` or
 * `Ridge-Munsoc`, and a rule that kept the hyphen would credit only the third.
 * That is a referrer losing Rs 150 because a stranger guessed a punctuation
 * mark wrong, which is the exact failure this table exists to prevent.
 *
 * Stored alongside the display form rather than derived on read, so the
 * uniqueness constraint is on the thing that actually decides identity.
 *
 * Returns null for anything that reduces to nothing, so "   " and "-" are the
 * same as not answering rather than an empty code nobody owns.
 */
export function normaliseReferralCode(input: string | null | undefined): string | null {
  if (input == null) return null

  const key = input
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  return key === '' ? null : key
}

/**
 * What a referrer earns, per approved delegate, in WHOLE NEPALI RUPEES — the
 * same unit as Registration.amountPaid and LedgerEntry, so these add without a
 * conversion.
 *
 * Two rates because the two are not the same sale. Bringing someone from
 * another school is the work this scheme is paying for; an LRI student or a
 * returning alumnus was already inside the building.
 */
export const REFERRAL_RATE_OUTSIDE = 150

/** Internal and alumni delegates. */
export const REFERRAL_RATE_HOUSE = 50

/**
 * How many of the Rs 150 kind a referrer needs before any of it is paid.
 *
 * Deliberately counted on outside delegates only. A threshold that counted
 * house delegates too could be cleared by ten friends who were coming anyway,
 * which is the one outcome this scheme should not pay for.
 */
export const REFERRAL_PAYOUT_QUOTA = 10

/** The two tiers that mean the delegate came from outside. */
const OUTSIDE_TIERS = new Set(['BASE', 'DISCOUNT'])

/** The two that mean they did not. */
const HOUSE_TIERS = new Set(['INTERNAL', 'ALUMNI'])

export interface ReferredRegistration {
  status: string
  priceTier: string | null
}

export interface ReferralTally {
  /** Approved, on an outside rate. These are what the quota counts. */
  outside: number
  /** Approved, on the internal or alumni rate. */
  house: number
  /**
   * Approved, but nobody has recorded which rate they paid yet, so there is no
   * honest way to say what the referrer earned for them. Shown separately
   * rather than guessed at.
   */
  unpriced: number
  /** Submitted, not yet approved or rejected. Worth nothing until they are. */
  pending: number
  /** Rejected or withdrawn. Kept visible so a falling count has an explanation. */
  rejected: number
  /** What the approved rows are worth, whether or not the quota is met. */
  earned: number
  /** What is actually owed: nothing until the quota is cleared. */
  payable: number
  /** How many more outside delegates are needed. Zero once the quota is met. */
  quotaRemaining: number
  quotaMet: boolean
}

/**
 * Turns one referrer's registrations into the numbers the hub shows and the
 * treasurer pays against.
 *
 * The rate follows `priceTier`, which is what the secretariat recorded after
 * looking at the payment, rather than anything the applicant claimed about
 * themselves. The form never asks whether someone is internal, alumni or
 * external — it asks for a school name in free text — so the recorded tier is
 * the only fact here that was actually checked by a person.
 */
export function tallyReferrals(registrations: readonly ReferredRegistration[]): ReferralTally {
  let outside = 0
  let house = 0
  let unpriced = 0
  let pending = 0
  let rejected = 0

  for (const registration of registrations) {
    if (registration.status === 'PENDING') {
      pending += 1
      continue
    }
    if (registration.status !== 'APPROVED') {
      rejected += 1
      continue
    }

    const tier = registration.priceTier
    if (tier !== null && OUTSIDE_TIERS.has(tier)) outside += 1
    else if (tier !== null && HOUSE_TIERS.has(tier)) house += 1
    else unpriced += 1
  }

  const earned = outside * REFERRAL_RATE_OUTSIDE + house * REFERRAL_RATE_HOUSE
  const quotaMet = outside >= REFERRAL_PAYOUT_QUOTA

  return {
    outside,
    house,
    unpriced,
    pending,
    rejected,
    earned,
    // The quota gates the payout, not the rate: once it is cleared, the house
    // delegates are paid for too.
    payable: quotaMet ? earned : 0,
    quotaRemaining: Math.max(0, REFERRAL_PAYOUT_QUOTA - outside),
    quotaMet,
  }
}

/**
 * What may be created as a code, which is stricter than what may be matched.
 *
 * Two to thirty-two characters, starting with a letter or digit, then letters,
 * digits and hyphens. Deliberately narrow: a code is written on a poster and
 * read off a phone screen, and every character outside this set is one more way
 * for someone to type it wrong.
 */
const CREATABLE = /^[A-Z0-9][A-Z0-9-]{1,31}$/

export interface ReferralCodeCheck {
  ok: boolean
  /** The readable form, as it will be printed. */
  code: string
  /** What it is matched on. Letters and digits only. */
  key: string
  /** Why it was refused, phrased for whoever is typing it into the hub. */
  reason?: string
}

export function checkReferralCode(input: string | null | undefined): ReferralCodeCheck {
  const code = referralDisplayCode(input)
  const key = normaliseReferralCode(input)

  if (code === null || key === null) {
    return { ok: false, code: '', key: '', reason: 'A referral code cannot be blank.' }
  }

  // Measured on the key, not the display form, so a hyphen does not count
  // toward the length of a code nobody types the hyphen in anyway.
  if (key.length < 2) {
    return { ok: false, code, key, reason: 'A referral code needs at least two characters.' }
  }

  if (code.length > 32) {
    return {
      ok: false,
      code,
      key,
      reason: `That is ${code.length} characters. Keep a referral code to 32 or fewer, so it fits on a poster.`,
    }
  }

  if (!CREATABLE.test(code)) {
    return {
      ok: false,
      code,
      key,
      reason:
        'Use letters, numbers and hyphens only, starting with a letter or a number. ' +
        'Spaces and capitals are fine to type later — they are ignored when a delegate enters the code, ' +
        'and so is the hyphen.',
    }
  }

  return { ok: true, code, key }
}
