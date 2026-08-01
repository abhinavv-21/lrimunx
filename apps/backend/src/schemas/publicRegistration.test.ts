import { describe, expect, it } from 'vitest'
import { publicRegistrationSchema, rejectRegistrationSchema } from './index.js'

/** A submission the conference website would actually send. */
function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fullName: 'Aarav Menon',
    email: 'aarav.menon@ridgeinternational.edu.in',
    phone: '+91 98450 22317',
    schoolName: 'Ridge International School',
    grade: '11',
    committeePreference: 'DISEC',
    dietaryNotes: 'Vegetarian',
    accessibilityNotes: 'Needs a seat near the door',
    ...overrides,
  }
}

describe('publicRegistrationSchema', () => {
  it('accepts a complete submission', () => {
    const parsed = publicRegistrationSchema.parse(validPayload())
    expect(parsed.fullName).toBe('Aarav Menon')
    expect(parsed.schoolName).toBe('Ridge International School')
    expect(parsed.committeePreference).toBe('DISEC')
  })

  it('lowercases and trims the email, because it is the identity key', () => {
    const parsed = publicRegistrationSchema.parse(
      validPayload({ email: '  Ishani.Rao@Greenwood.Edu.IN  ' }),
    )
    expect(parsed.email).toBe('ishani.rao@greenwood.edu.in')
  })

  it('trims the free-text fields a form leaves padded', () => {
    const parsed = publicRegistrationSchema.parse(
      validPayload({ fullName: '  Kabir Sethi  ', schoolName: '  Greenwood High  ' }),
    )
    expect(parsed.fullName).toBe('Kabir Sethi')
    expect(parsed.schoolName).toBe('Greenwood High')
  })

  it('treats every optional as absent when the applicant skips it', () => {
    const parsed = publicRegistrationSchema.parse({
      fullName: 'Rhea Kapoor',
      email: 'rhea.kapoor@ridgeinternational.edu.in',
      phone: '+91 99001 44528',
      schoolName: 'Ridge International School',
      grade: '12',
    })

    expect(parsed.committeePreference).toBeUndefined()
    expect(parsed.dietaryNotes).toBeUndefined()
    expect(parsed.accessibilityNotes).toBeUndefined()
    expect(parsed.hp_website).toBeUndefined()
  })

  it('keeps an explicit null distinct from an omitted optional', () => {
    const parsed = publicRegistrationSchema.parse(validPayload({ committeePreference: null }))
    expect(parsed.committeePreference).toBeNull()
  })

  it.each([
    ['fullName missing', { fullName: undefined }],
    ['fullName too short', { fullName: 'A' }],
    ['fullName too long', { fullName: 'A'.repeat(121) }],
    ['fullName blank after trimming', { fullName: '   ' }],
    ['email missing', { email: undefined }],
    ['email malformed', { email: 'aarav.menon.ridgeinternational' }],
    ['email too long', { email: `${'a'.repeat(155)}@ridge.edu` }],
    ['phone missing', { phone: undefined }],
    ['phone too short', { phone: '4521' }],
    ['phone with letters', { phone: '+91 call-me' }],
    ['schoolName missing', { schoolName: undefined }],
    ['schoolName too short', { schoolName: 'R' }],
    ['schoolName too long', { schoolName: 'R'.repeat(161) }],
    ['grade missing', { grade: undefined }],
    ['grade blank', { grade: '' }],
    ['grade too long', { grade: 'Senior Secondary Year Twelve' }],
    ['committeePreference too long', { committeePreference: 'D'.repeat(161) }],
    ['dietaryNotes too long', { dietaryNotes: 'V'.repeat(501) }],
    ['accessibilityNotes too long', { accessibilityNotes: 'W'.repeat(501) }],
  ])('rejects %s', (_label, override) => {
    expect(publicRegistrationSchema.safeParse(validPayload(override)).success).toBe(false)
  })

  it('accepts an international number in the format the form suggests', () => {
    for (const number of ['+91 98450 22317', '9845022317', '+44 (0)20 7946 0958', '080-2345-6789']) {
      expect(publicRegistrationSchema.safeParse(validPayload({ phone: number })).success).toBe(true)
    }
  })

  /**
   * The honeypot contract. Enforcement of a *filled* trap is honeypotGate's
   * job, not the schema's — the gate answers with a fake 201 before validation
   * runs, so a bot is never handed a 422 telling it which field gave it away.
   */
  describe('honeypot', () => {
    it('accepts the empty hidden input a browser posts', () => {
      expect(publicRegistrationSchema.parse(validPayload({ hp_website: '' })).hp_website).toBe('')
    })

    it('accepts the field being absent entirely', () => {
      expect(publicRegistrationSchema.safeParse(validPayload()).success).toBe(true)
    })

    it('does not carry a filled trap through as valid input', () => {
      const result = publicRegistrationSchema.safeParse(validPayload({ hp_website: 'https://spam.example' }))
      expect(result.success).toBe(false)
    })
  })

  it('strips fields the applicant is not allowed to decide for themselves', () => {
    const parsed = publicRegistrationSchema.parse(
      validPayload({ role: 'ADMIN', status: 'APPROVED', username: 'aarav', committeeId: 'UNSC' }),
    ) as Record<string, unknown>

    // Zod objects are strip-by-default, so nothing here survives into the row.
    expect(parsed['role']).toBeUndefined()
    expect(parsed['status']).toBeUndefined()
    expect(parsed['username']).toBeUndefined()
    expect(parsed['committeeId']).toBeUndefined()
  })
})

describe('rejectRegistrationSchema', () => {
  it('accepts a rejection with no reason given', () => {
    expect(rejectRegistrationSchema.safeParse({}).success).toBe(true)
  })

  it('trims the reason', () => {
    const parsed = rejectRegistrationSchema.parse({ reason: '  Duplicate of an earlier form  ' })
    expect(parsed.reason).toBe('Duplicate of an earlier form')
  })

  it('rejects a reason longer than the column allows', () => {
    expect(rejectRegistrationSchema.safeParse({ reason: 'x'.repeat(301) }).success).toBe(false)
  })
})
