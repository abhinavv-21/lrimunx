import { describe, expect, it } from 'vitest'
import { RegistrationStatus } from '@prisma/client'
import {
  REFERENCE_ALPHABET,
  REFERENCE_LENGTH,
  REFERENCE_PATTERN,
  REFERENCE_PREFIX,
  checkReviewTransition,
  generateReference,
  isHoneypotTripped,
} from './registrations.js'

describe('generateReference', () => {
  it('produces LMX- followed by six alphabet characters', () => {
    const reference = generateReference()
    expect(reference).toMatch(REFERENCE_PATTERN)
    expect(reference).toHaveLength(REFERENCE_PREFIX.length + REFERENCE_LENGTH)
    expect(reference.startsWith(REFERENCE_PREFIX)).toBe(true)
  })

  it('never emits a character an applicant could misread down the phone', () => {
    for (const forbidden of ['I', 'O', '0', '1']) {
      expect(REFERENCE_ALPHABET).not.toContain(forbidden)
    }

    const drawn = new Set<string>()
    for (let i = 0; i < 2_000; i++) {
      for (const char of generateReference().slice(REFERENCE_PREFIX.length)) drawn.add(char)
    }

    for (const char of drawn) expect(REFERENCE_ALPHABET).toContain(char)
  })

  it('spreads across the alphabet rather than favouring a corner of it', () => {
    const counts = new Map<string, number>()
    const draws = 5_000

    for (let i = 0; i < draws; i++) {
      for (const char of generateReference().slice(REFERENCE_PREFIX.length)) {
        counts.set(char, (counts.get(char) ?? 0) + 1)
      }
    }

    expect(counts.size).toBe(REFERENCE_ALPHABET.length)

    const expected = (draws * REFERENCE_LENGTH) / REFERENCE_ALPHABET.length
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.5)
      expect(count).toBeLessThan(expected * 1.5)
    }
  })

  it('does not repeat itself over a large run', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5_000; i++) seen.add(generateReference())

    expect(seen.size).toBeGreaterThan(4_990)
  })
})

describe('checkReviewTransition', () => {
  it('allows either decision on a pending application', () => {
    expect(checkReviewTransition(RegistrationStatus.PENDING, 'approve').allowed).toBe(true)
    expect(checkReviewTransition(RegistrationStatus.PENDING, 'reject').allowed).toBe(true)
  })

  it('refuses to approve an application that already has a delegate', () => {
    const check = checkReviewTransition(RegistrationStatus.APPROVED, 'approve')
    expect(check.allowed).toBe(false)
    expect(check.reason).toBeTruthy()
  })

  it('refuses to reject an approved application rather than orphaning its delegate', () => {
    const check = checkReviewTransition(RegistrationStatus.APPROVED, 'reject')
    expect(check.allowed).toBe(false)
    expect(check.reason).toContain('delegate')
  })

  it('refuses to reverse a rejection — the applicant reapplies instead', () => {
    expect(checkReviewTransition(RegistrationStatus.REJECTED, 'approve').allowed).toBe(false)
  })

  it('refuses to reject twice, so the recorded reviewer stays the one who decided', () => {
    expect(checkReviewTransition(RegistrationStatus.REJECTED, 'reject').allowed).toBe(false)
  })

  it('carries an operator-readable reason on every refusal', () => {
    for (const status of Object.values(RegistrationStatus)) {
      for (const action of ['approve', 'reject'] as const) {
        const check = checkReviewTransition(status, action)
        if (check.allowed) continue
        expect(check.reason?.length ?? 0).toBeGreaterThan(0)
      }
    }
  })

  it('leaves PENDING as the only reviewable state', () => {
    const reviewable = Object.values(RegistrationStatus).filter(
      (status) => checkReviewTransition(status, 'approve').allowed,
    )
    expect(reviewable).toEqual([RegistrationStatus.PENDING])
  })
})

describe('isHoneypotTripped', () => {
  it('treats an absent or blank field as a real applicant', () => {
    expect(isHoneypotTripped(undefined)).toBe(false)
    expect(isHoneypotTripped(null)).toBe(false)
    expect(isHoneypotTripped('')).toBe(false)

    expect(isHoneypotTripped('   ')).toBe(false)
  })

  it('catches anything a form-filling script would put there', () => {
    expect(isHoneypotTripped('https://cheap-placards.example')).toBe(true)
    expect(isHoneypotTripped('x')).toBe(true)
  })
})
