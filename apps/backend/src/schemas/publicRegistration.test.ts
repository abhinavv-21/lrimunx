import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOwnStorageUrl, publicRegistrationSchema, rejectRegistrationSchema } from './index.js'

const BLOB_URL =
  'https://testproject.supabase.co/storage/v1/s3/lrimunx-test/payment-proofs/9Kq2LmR4.png'

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fullName: 'Aarav Menon',
    email: 'aarav.menon@ridgeinternational.edu.in',
    phone: '+91 98450 22317',
    schoolName: 'Ridge International School',
    grade: '11',
    committeePreference: 'DISEC',
    committeePreference2: 'UNHRC',
    munsAttended: '4',
    awardsWon: '1',
    referralCode: 'RIDGE-MUNSOC',
    paymentProofUrl: BLOB_URL,
    dietaryNotes: 'Vegetarian',
    accessibilityNotes: 'Needs a seat near the door',
    ...overrides,
  }
}

function failedPaths(payload: Record<string, unknown>): string[] {
  const result = publicRegistrationSchema.safeParse(payload)
  expect(result.success).toBe(false)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
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
    expect(parsed.committeePreference2).toBeUndefined()
    expect(parsed.munsAttended).toBeUndefined()
    expect(parsed.awardsWon).toBeUndefined()
    expect(parsed.referralCode).toBeUndefined()
    expect(parsed.paymentProofUrl).toBeUndefined()
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
    ['committeePreference2 too long', { committeePreference2: 'U'.repeat(161) }],
    ['referralCode too long', { referralCode: 'R'.repeat(41) }],
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

  describe('MUN experience', () => {
    it('reads the counts a number input actually posts', () => {
      const parsed = publicRegistrationSchema.parse(validPayload({ munsAttended: '7', awardsWon: '2' }))
      expect(parsed.munsAttended).toBe(7)
      expect(parsed.awardsWon).toBe(2)
    })

    it('accepts them as JSON numbers too', () => {
      const parsed = publicRegistrationSchema.parse(validPayload({ munsAttended: 7, awardsWon: 2 }))
      expect(parsed.munsAttended).toBe(7)
      expect(parsed.awardsWon).toBe(2)
    })

    it('treats an untouched field as no answer, but keeps a zero as an answer', () => {
      const blank = publicRegistrationSchema.parse(validPayload({ munsAttended: '', awardsWon: '' }))
      expect(blank.munsAttended).toBeNull()
      expect(blank.awardsWon).toBeNull()

      const firstTimer = publicRegistrationSchema.parse(validPayload({ munsAttended: '0', awardsWon: '0' }))
      expect(firstTimer.munsAttended).toBe(0)
      expect(firstTimer.awardsWon).toBe(0)
    })

    it.each([
      ['a negative count', { munsAttended: '-3', awardsWon: '0' }],
      ['a count past 99', { munsAttended: '100', awardsWon: '0' }],
      ['a fractional count', { munsAttended: 2.5, awardsWon: 0 }],
      ['words instead of a number', { munsAttended: 'a few', awardsWon: '0' }],
      ['a boolean a bot might send', { munsAttended: true, awardsWon: '0' }],
    ])('rejects %s', (_label, override) => {
      expect(publicRegistrationSchema.safeParse(validPayload(override)).success).toBe(false)
    })

    it('refuses more awards than conferences attended, and says which field', () => {
      expect(failedPaths(validPayload({ munsAttended: '1', awardsWon: '3' }))).toContain('awardsWon')
    })

    it('allows an award at every conference attended', () => {
      const parsed = publicRegistrationSchema.parse(validPayload({ munsAttended: '3', awardsWon: '3' }))
      expect(parsed.awardsWon).toBe(3)
    })

    it('does not second-guess an applicant who answered only one of the two', () => {
      expect(publicRegistrationSchema.safeParse(validPayload({ munsAttended: '', awardsWon: '2' })).success).toBe(
        true,
      )
      expect(publicRegistrationSchema.safeParse(validPayload({ munsAttended: '5', awardsWon: '' })).success).toBe(
        true,
      )
    })
  })

  describe('payment proof', () => {
    it('accepts a URL on the blob store', () => {
      expect(publicRegistrationSchema.parse(validPayload()).paymentProofUrl).toBe(BLOB_URL)
    })

    it('treats an unattached screenshot as no answer', () => {
      expect(publicRegistrationSchema.parse(validPayload({ paymentProofUrl: '' })).paymentProofUrl).toBeNull()
    })

    it.each([
      ['somebody else’s host', 'https://evil.example/x.png'],
      ["our bucket path on somebody else's host", 'https://evil.example/storage/v1/s3/lrimunx-test/payment-proofs/x.png'],
      ['our whole URL in a fragment', 'https://evil.example/x.png#https://testproject.supabase.co/storage/v1/s3/lrimunx-test/payment-proofs/x.png'],
      ['our host as userinfo', 'https://testproject.supabase.co@evil.example/x.png'],
      ['a lookalike host', 'https://testproject.supabase.co.evil.example/storage/v1/s3/lrimunx-test/payment-proofs/x.png'],
      ["somebody else's project", 'https://otherproject.supabase.co/storage/v1/s3/lrimunx-test/payment-proofs/x.png'],
      ['plain http', 'http://testproject.supabase.co/storage/v1/s3/lrimunx-test/payment-proofs/x.png'],
      ['a different bucket on our host', 'https://testproject.supabase.co/storage/v1/s3/other-bucket/payment-proofs/x.png'],
      ['outside the payment-proofs prefix', 'https://testproject.supabase.co/storage/v1/s3/lrimunx-test/elsewhere/x.png'],
      ['a javascript URL', 'javascript:alert(1)'],
      ['a data URL', 'data:image/png;base64,iVBORw0KGgo='],
      ['not a URL at all', 'payment.png'],
    ])('rejects %s', (_label, url) => {
      expect(failedPaths(validPayload({ paymentProofUrl: url }))).toContain('paymentProofUrl')
    })
  })

  it('strips fields the applicant is not allowed to decide for themselves', () => {
    const parsed = publicRegistrationSchema.parse(
      validPayload({ role: 'ADMIN', status: 'APPROVED', username: 'aarav', committeeId: 'UNSC' }),
    ) as Record<string, unknown>

    expect(parsed['role']).toBeUndefined()
    expect(parsed['status']).toBeUndefined()
    expect(parsed['username']).toBeUndefined()
    expect(parsed['committeeId']).toBeUndefined()
  })
})

describe('isOwnStorageUrl', () => {
  it('accepts an object in the configured bucket', () => {
    expect(isOwnStorageUrl(BLOB_URL)).toBe(true)
  })

  it('refuses the store this project used to be on', () => {
    expect(isOwnStorageUrl('https://abc.private.blob.vercel-storage.com/a/b/c.webp')).toBe(false)
  })

  it('does not throw on input that is not a URL', () => {
    expect(isOwnStorageUrl('')).toBe(false)
    expect(isOwnStorageUrl('://')).toBe(false)
  })
})

describe('isOwnStorageUrl, pinned to our own bucket', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const ENDPOINT = 'https://abcdefgh.supabase.co/storage/v1/s3'
  const BUCKET = 'payment-proofs'

  async function withStore(endpoint = ENDPOINT, bucket = BUCKET) {
    vi.resetModules()
    vi.stubEnv('S3_ENDPOINT', endpoint)
    vi.stubEnv('S3_BUCKET', bucket)
    vi.stubEnv('S3_ACCESS_KEY_ID', 'test-key')
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'test-secret')
    return (await import('./index.js')).isOwnStorageUrl
  }

  it('accepts an object in our bucket and refuses every other host', async () => {
    const check = await withStore()

    expect(check(`${ENDPOINT}/${BUCKET}/payment-proofs/9f1c.png`)).toBe(true)

    expect(check(`https://zzzzzzzz.supabase.co/storage/v1/s3/${BUCKET}/payment-proofs/9f1c.png`)).toBe(false)

    expect(check(`${ENDPOINT}/other-bucket/payment-proofs/9f1c.png`)).toBe(false)
  })

  it('refuses anything outside the payment-proofs prefix', async () => {
    const check = await withStore()

    expect(check(`${ENDPOINT}/${BUCKET}/somewhere-else/9f1c.png`)).toBe(false)
    expect(check(`${ENDPOINT}/${BUCKET}/payment-proofs/../../etc/passwd`)).toBe(false)
  })

  it('refuses a lookalike that only contains our host', async () => {
    const check = await withStore()

    expect(check(`https://evil.example/x.png#${ENDPOINT}/${BUCKET}/payment-proofs/a.png`)).toBe(false)
    expect(check(`http://abcdefgh.supabase.co/storage/v1/s3/${BUCKET}/payment-proofs/a.png`)).toBe(false)
    expect(check('not a url at all')).toBe(false)
  })

  it('refuses everything when no bucket is configured', async () => {
    vi.resetModules()
    vi.stubEnv('S3_ENDPOINT', '')
    vi.stubEnv('S3_BUCKET', '')
    const check = (await import('./index.js')).isOwnStorageUrl

    expect(check(`${ENDPOINT}/${BUCKET}/payment-proofs/9f1c.png`)).toBe(false)
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
