import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBlobStorageUrl, publicRegistrationSchema, rejectRegistrationSchema } from './index.js'

/**
 * A screenshot as Vercel Blob hands it back after a client upload.
 *
 * PRIVATE, because the store is: a payment screenshot is a transaction record
 * and is not readable by anyone holding the URL. The two access levels serve
 * from different hosts, and `BLOB_ACCESS` — which defaults to private — is what
 * decides which one this accepts.
 */
const BLOB_URL =
  'https://k3mq1zfwvbdxpnl8.private.blob.vercel-storage.com/payment-proof-9Kq2LmR4.png'

/** A submission the conference website would actually send. */
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

/** The field paths a failed parse blamed. */
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

  /**
   * A browser number input posts a string, and an untouched one posts "". Both
   * have to land in an integer column without the applicant seeing a type
   * error about something they never typed.
   */
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

      // "0 MUNs" is a first-timer declaring themselves, which is exactly the
      // fact an allocator wants. It must not collapse into "did not say".
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
      // You cannot win an award at a conference you did not go to.
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

  /**
   * The payment screenshot is a link an admin clicks from the review queue, so
   * a field that accepts any URL is an attacker-chosen destination handed to
   * the one account that can approve registrations and mint users.
   */
  describe('payment proof', () => {
    it('accepts a URL on the blob store', () => {
      expect(publicRegistrationSchema.parse(validPayload()).paymentProofUrl).toBe(BLOB_URL)
    })

    it('treats an unattached screenshot as no answer', () => {
      expect(publicRegistrationSchema.parse(validPayload({ paymentProofUrl: '' })).paymentProofUrl).toBeNull()
    })

    it.each([
      ['somebody else’s host', 'https://evil.example/x.png'],
      ['the blob host as a path', 'https://evil.example/private.blob.vercel-storage.com/x.png'],
      ['the blob host in a fragment', 'https://evil.example/x.png#.private.blob.vercel-storage.com'],
      ['the blob host as userinfo', 'https://k3mq.private.blob.vercel-storage.com@evil.example/x.png'],
      ['a lookalike host', 'https://evilprivate.blob.vercel-storage.com/x.png'],
      ['the bare blob domain with no store', 'https://private.blob.vercel-storage.com/x.png'],
      ['plain http', 'http://k3mq.private.blob.vercel-storage.com/x.png'],
      ['the public host, on a private store', 'https://k3mq.public.blob.vercel-storage.com/x.png'],
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

    // Zod objects are strip-by-default, so nothing here survives into the row.
    expect(parsed['role']).toBeUndefined()
    expect(parsed['status']).toBeUndefined()
    expect(parsed['username']).toBeUndefined()
    expect(parsed['committeeId']).toBeUndefined()
  })
})

describe('isBlobStorageUrl', () => {
  it('accepts any store on the blob host when none is configured', () => {
    expect(isBlobStorageUrl(BLOB_URL)).toBe(true)
    expect(isBlobStorageUrl('https://abc.private.blob.vercel-storage.com/a/b/c.webp')).toBe(true)
  })

  it('does not throw on input that is not a URL', () => {
    // It runs on unauthenticated input, so a thrown TypeError here would be a
    // 500 on the public form rather than a 422 on the field.
    expect(isBlobStorageUrl('')).toBe(false)
    expect(isBlobStorageUrl('://')).toBe(false)
  })
})

/**
 * With a store id configured the check pins to that one store, not to the host.
 *
 * This is the difference that matters in production. Anybody can create a
 * Vercel Blob store in under a minute, and without the pin a URL on THEIR store
 * satisfies the host check — so the field would still accept an attacker-hosted
 * image, which is the whole thing the check exists to prevent.
 *
 * `env` is read at module load, so each case re-imports the module under a
 * different environment rather than mutating one that has already been parsed.
 */
describe('isBlobStorageUrl, pinned to a configured store', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function withStore(storeId: string, access = 'private') {
    vi.resetModules()
    vi.stubEnv('BLOB_STORE_ID', storeId)
    vi.stubEnv('BLOB_ACCESS', access)
    return (await import('./index.js')).isBlobStorageUrl
  }

  it('accepts the configured store and refuses every other one', async () => {
    const check = await withStore('store_9mlCqNa8wYTM')

    // The host is the id lowercased with the prefix dropped.
    expect(check('https://9mlcqna8wytm.private.blob.vercel-storage.com/proof.png')).toBe(true)
    expect(check('https://k3mq1zfwvbdxpnl8.private.blob.vercel-storage.com/proof.png')).toBe(false)
    expect(check('https://9mlcqna8wytm.public.blob.vercel-storage.com/proof.png')).toBe(false)
  })

  it('follows BLOB_ACCESS to the right host', async () => {
    const check = await withStore('store_9mlCqNa8wYTM', 'public')

    expect(check('https://9mlcqna8wytm.public.blob.vercel-storage.com/proof.png')).toBe(true)
    expect(check('https://9mlcqna8wytm.private.blob.vercel-storage.com/proof.png')).toBe(false)
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
