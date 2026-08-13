import { describe, expect, it } from 'vitest'
import {
  ALLOWED_UPLOAD_TYPES,
  isStorageUrl,
  keyFromUrl,
  newUploadKey,
  objectUrl,
  presignGet,
  presignPut,
  storageEnabled,
} from './storage.js'

const ENDPOINT = 'https://testproject.supabase.co/storage/v1/s3'
const BUCKET = 'lrimunx-test'

describe('storage configuration', () => {
  it('is enabled when all four values are present', () => {
    expect(storageEnabled).toBe(true)
  })

  it('builds path-style URLs, which is the one form every provider accepts', () => {
    expect(objectUrl('payment-proofs/a.png')).toBe(`${ENDPOINT}/${BUCKET}/payment-proofs/a.png`)
  })
})

describe('newUploadKey', () => {
  it('gives every upload its own unguessable name', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newUploadKey('image/png')))
    expect(keys.size).toBe(50)
  })

  it('keeps the extension matching the content type', () => {
    expect(newUploadKey('image/png')).toMatch(/^payment-proofs\/[0-9a-f-]{36}\.png$/)
    expect(newUploadKey('image/jpeg')).toMatch(/\.jpg$/)
    expect(newUploadKey('image/webp')).toMatch(/\.webp$/)
  })

  it('stays inside its own prefix', () => {
    for (const type of ALLOWED_UPLOAD_TYPES) {
      expect(newUploadKey(type).startsWith('payment-proofs/')).toBe(true)
    }
  })
})

describe('keyFromUrl', () => {
  it('round-trips a key it produced', () => {
    const key = newUploadKey('image/png')
    expect(keyFromUrl(objectUrl(key))).toBe(key)
  })

  it('refuses another bucket, another host, and a climb out of the prefix', () => {
    expect(keyFromUrl(`${ENDPOINT}/other-bucket/payment-proofs/a.png`)).toBeNull()
    expect(keyFromUrl(`https://evil.example/${BUCKET}/payment-proofs/a.png`)).toBeNull()
    expect(keyFromUrl(`${ENDPOINT}/${BUCKET}/payment-proofs/../../secrets.env`)).toBeNull()
    expect(keyFromUrl(`${ENDPOINT}/${BUCKET}/elsewhere/a.png`)).toBeNull()
  })
})

describe('presignPut', () => {
  it('signs a URL on our own bucket, with an expiry', async () => {
    const key = newUploadKey('image/png')
    const { uploadUrl, fileUrl, contentType } = await presignPut(key, 'image/png')

    const url = new URL(uploadUrl)
    expect(`${url.origin}${url.pathname}`).toBe(objectUrl(key))
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(30 * 60))
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')

    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host')

    expect(contentType).toBe('image/png')

    expect(fileUrl).toBe(objectUrl(key))
    expect(fileUrl).not.toContain('X-Amz-Signature')
    expect(isStorageUrl(fileUrl)).toBe(true)
  })

  it('signs differently for each key, so one URL cannot be spent on another object', async () => {
    const a = await presignPut(newUploadKey('image/png'), 'image/png')
    const b = await presignPut(newUploadKey('image/png'), 'image/png')
    expect(a.uploadUrl).not.toBe(b.uploadUrl)
  })
})

describe('presignGet', () => {
  it('signs a read URL that expires when told to', async () => {
    const key = newUploadKey('image/jpeg')
    const url = new URL(await presignGet(key, 10 * 60 * 1000))

    expect(`${url.origin}${url.pathname}`).toBe(objectUrl(key))
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
  })
})
