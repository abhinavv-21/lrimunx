import { describe, expect, it } from 'vitest'
import {
  checkReferralCode,
  normaliseReferralCode,
  referralDisplayCode,
  tallyReferrals,
} from './referrals.js'

describe('normalising a typed referral code', () => {
  it('treats every way of typing one code as the same code', () => {
    // Including the ones with a space where the poster had a hyphen, and none
    // at all. Somebody reading a code off a wall does not know which it was,
    // and getting it wrong must not cost their referrer a payout.
    const spellings = [
      'RIDGE-MUNSOC',
      'ridge-munsoc',
      'Ridge-Munsoc',
      '  RIDGE-MUNSOC  ',
      'RIDGE - MUNSOC',
      'RIDGE -MUNSOC',
      'ridge munsoc',
      'RIDGEMUNSOC',
      'RIDGE–MUNSOC',
      'Ridge  Munsoc',
    ]

    const keys = spellings.map(normaliseReferralCode)
    expect(new Set(keys)).toEqual(new Set(['RIDGEMUNSOC']))
  })

  it('keeps the hyphen in the form that gets printed', () => {
    // The key is for matching; this is what goes on the poster and in the hub.
    expect(referralDisplayCode('ridge-munsoc')).toBe('RIDGE-MUNSOC')
    expect(referralDisplayCode('ridge munsoc')).toBe('RIDGEMUNSOC')
    // An en dash off a phone keyboard still prints as a plain hyphen.
    expect(referralDisplayCode('RIDGE–MUNSOC')).toBe('RIDGE-MUNSOC')
  })

  it('folds the dash a phone keyboard gives you into the one a poster shows', () => {
    // en dash, em dash, non-breaking hyphen, figure dash
    for (const dash of ['–', '—', '‑', '‒']) {
      expect(referralDisplayCode(`RIDGE${dash}MUNSOC`)).toBe('RIDGE-MUNSOC')
      expect(normaliseReferralCode(`RIDGE${dash}MUNSOC`)).toBe('RIDGEMUNSOC')
    }
  })

  it('strips characters that are there but cannot be seen', () => {
    // Pasted out of a chat app or a PDF, these ride along invisibly and would
    // otherwise make a visually identical code fail to match.
    expect(normaliseReferralCode('RIDGE\u200B-MUNSOC')).toBe('RIDGEMUNSOC')
    expect(normaliseReferralCode('\uFEFFRIDGE-MUNSOC')).toBe('RIDGEMUNSOC')
  })

  it('folds full-width characters, which an IME keyboard produces', () => {
    expect(normaliseReferralCode('ＲＩＤＧＥ')).toBe('RIDGE')
  })

  it('is idempotent, so normalising a stored key changes nothing', () => {
    const once = normaliseReferralCode('  ridge munsoc ')
    expect(normaliseReferralCode(once)).toBe(once)
  })

  it('treats blank, whitespace and absent as the same non-answer', () => {
    for (const input of [null, undefined, '', '   ', '\t\n', '\u200B', '-', ' - ']) {
      expect(normaliseReferralCode(input)).toBeNull()
    }
  })
})

describe('what may be created as a code in the hub', () => {
  it('accepts a code however it was typed, and returns both forms', () => {
    expect(checkReferralCode('  ridge munsoc ')).toEqual({
      ok: true,
      code: 'RIDGEMUNSOC',
      key: 'RIDGEMUNSOC',
    })
    // The hyphen survives in what gets printed and not in what gets matched.
    expect(checkReferralCode('Ridge-Munsoc')).toEqual({
      ok: true,
      code: 'RIDGE-MUNSOC',
      key: 'RIDGEMUNSOC',
    })
    expect(checkReferralCode('AB')).toEqual({ ok: true, code: 'AB', key: 'AB' })
    expect(checkReferralCode('2026')).toEqual({ ok: true, code: '2026', key: '2026' })
  })

  it('refuses a code that is the same as one already printed differently', () => {
    // Not enforced here — the database's unique index on matchKey does that —
    // but the two forms have to come back so the route can check it.
    expect(checkReferralCode('RIDGE-MUNSOC').key).toBe(checkReferralCode('ridge munsoc').key)
  })

  it('refuses a blank one with a reason rather than creating a code nobody owns', () => {
    const result = checkReferralCode('   ')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/cannot be blank/i)
  })

  it('refuses one character, because a single letter collides with everything', () => {
    expect(checkReferralCode('A').ok).toBe(false)
    // The length that matters is the key's. "A-" is one letter with decoration.
    expect(checkReferralCode('A-').ok).toBe(false)
  })

  it('refuses one too long to put on a poster, and says how long it was', () => {
    const result = checkReferralCode('R'.repeat(33))
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('33 characters')
  })

  it('refuses punctuation that invites a typo, and explains what is allowed', () => {
    for (const code of ['RIDGE_MUNSOC', 'RIDGE.MUNSOC', 'RIDGE@MUNSOC', 'RIDGE/MUNSOC']) {
      const result = checkReferralCode(code)
      expect(result.ok, code).toBe(false)
      expect(result.reason).toMatch(/letters, numbers and hyphens/i)
    }
  })

  it('refuses one that starts with a hyphen', () => {
    expect(checkReferralCode('-RIDGE').ok).toBe(false)
  })

  it('does not tell someone off for typing lower case or spaces', () => {
    // The hub normalises for them. A validation error here would be the app
    // refusing to do something it is perfectly capable of doing.
    expect(checkReferralCode('ridge munsoc').ok).toBe(true)
  })
})

describe('what a referrer has earned', () => {
  const approved = (priceTier: string | null) => ({ status: 'APPROVED', priceTier })
  const many = (n: number, tier: string | null) => Array.from({ length: n }, () => approved(tier))

  it('pays nothing until ten outside delegates have been approved', () => {
    const tally = tallyReferrals(many(9, 'BASE'))
    expect(tally.outside).toBe(9)
    expect(tally.earned).toBe(1350)
    expect(tally.payable).toBe(0)
    expect(tally.quotaRemaining).toBe(1)
    expect(tally.quotaMet).toBe(false)
  })

  it('pays the whole earned amount the moment the tenth lands', () => {
    const tally = tallyReferrals(many(10, 'DISCOUNT'))
    expect(tally.payable).toBe(1500)
    expect(tally.quotaRemaining).toBe(0)
    expect(tally.quotaMet).toBe(true)
  })

  it('counts only outside delegates toward the quota', () => {
    // Twenty internal referrals do not unlock a payout on their own. Somebody
    // whose whole list is classmates has not done the thing being paid for.
    const tally = tallyReferrals(many(20, 'INTERNAL'))
    expect(tally.house).toBe(20)
    expect(tally.earned).toBe(1000)
    expect(tally.payable).toBe(0)
    expect(tally.quotaRemaining).toBe(10)
  })

  it('pays for the house delegates too, once the quota is cleared', () => {
    const tally = tallyReferrals([...many(10, 'BASE'), ...many(4, 'INTERNAL'), ...many(2, 'ALUMNI')])
    expect(tally.outside).toBe(10)
    expect(tally.house).toBe(6)
    expect(tally.payable).toBe(10 * 150 + 6 * 50)
  })

  it('treats alumni as house, not outside', () => {
    const tally = tallyReferrals(many(10, 'ALUMNI'))
    expect(tally.outside).toBe(0)
    expect(tally.house).toBe(10)
    expect(tally.payable).toBe(0)
  })

  it('does not guess a rate for an approved delegate whose payment is unrecorded', () => {
    const tally = tallyReferrals([...many(10, 'BASE'), approved(null)])
    expect(tally.unpriced).toBe(1)
    // The eleventh is worth nothing yet, rather than being assumed to be worth 150.
    expect(tally.payable).toBe(1500)
  })

  it('counts a pending registration as pending, worth nothing', () => {
    const tally = tallyReferrals([
      ...many(10, 'BASE'),
      { status: 'PENDING', priceTier: 'DISCOUNT' },
    ])
    expect(tally.pending).toBe(1)
    expect(tally.outside).toBe(10)
    expect(tally.payable).toBe(1500)
  })

  it('keeps rejected ones visible, so a count that fell has an explanation', () => {
    const tally = tallyReferrals([...many(3, 'BASE'), { status: 'REJECTED', priceTier: 'BASE' }])
    expect(tally.rejected).toBe(1)
    expect(tally.outside).toBe(3)
  })

  it('is zero all the way down for a code nobody has used', () => {
    expect(tallyReferrals([])).toMatchObject({
      outside: 0, house: 0, earned: 0, payable: 0, quotaRemaining: 10, quotaMet: false,
    })
  })
})
