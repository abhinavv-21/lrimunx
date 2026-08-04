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

/**
 * The bucket these run against is the fake one in vitest.config.ts. Nothing is
 * ever fetched; what is checked is that we hand the browser a URL that is on
 * OUR store, signed, and expiring — the three properties the upload flow rests
 * on and the ones that would fail silently if aws4fetch were called wrongly.
 */
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
    // Two applicants both uploading "payment.jpg" must not collide, and a
    // predictable path would let anyone overwrite someone else's proof.
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

    // Only the host is signed — aws4fetch's signQuery does not cover other
    // headers. Pinned as a fact rather than an aspiration: an earlier version
    // of this module claimed the content type was bound into the signature and
    // it never was. What the URL authorises is these bytes at this key.
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    // Returned so the browser sends the type the object should be stored with,
    // which is what makes it render for a reviewer rather than download.
    expect(contentType).toBe('image/png')

    // What gets stored on the registration is the plain URL, never the signed
    // one: a signature in the database would be a credential with a clock on it.
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
