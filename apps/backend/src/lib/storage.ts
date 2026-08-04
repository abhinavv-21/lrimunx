/**
 * storage.ts — payment screenshots, on any S3-compatible object store.
 *
 * WHY S3 AND NOT A PROVIDER SDK
 * This is written against the S3 API rather than against Supabase, R2 or
 * anything else, because the store is the one part of this system that has
 * already moved once and will move again. Supabase today, R2 if there is ever
 * a budget, MinIO on the school's own box later — all three speak S3, so the
 * move is four environment variables and no code. `@vercel/blob` was the only
 * genuine lock-in in the repository and this is what replaces it.
 *
 * WHY THE FILE NEVER PASSES THROUGH THIS SERVER
 * The browser PUTs straight to the store using a URL signed here. That matters
 * more on Render's free instance than it did on Vercel: a 512 MB box with a
 * fraction of a CPU has no business buffering an 8 MB photo, and doing so
 * would compete with the request that actually needs the CPU — somebody
 * signing in.
 *
 * WHY THE BUCKET IS PRIVATE
 * A payment screenshot is a financial record with a name on it. Objects are
 * unreadable without a signed URL, and only the ops hub can ask for one — see
 * presignGet, and the route that calls it.
 */
import { AwsClient } from 'aws4fetch'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'

/** Image types a phone camera or a banking app actually produces. */
export const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number]

const EXTENSION: Record<AllowedUploadType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** Everything this module writes lives under here, so the bucket stays legible. */
const PREFIX = 'payment-proofs'

/**
 * Built once. `aws4fetch` is 80 KB and has no dependencies, which is the reason
 * it is here rather than `@aws-sdk/client-s3` — the AWS SDK is roughly fifteen
 * megabytes for the two operations this file needs, and it would be paid for on
 * every cold start of a free instance.
 */
const client = env.s3UploadsEnabled
  ? new AwsClient({
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      service: 's3',
      region: env.S3_REGION,
    })
  : null

/** Trailing slashes here produce `//` in every signed URL, and S3 treats that as a real empty path segment. */
const endpoint = env.S3_ENDPOINT.replace(/\/+$/, '')

export const storageEnabled = env.s3UploadsEnabled

/**
 * Path-style, not virtual-host style: `<endpoint>/<bucket>/<key>`.
 *
 * Supabase and MinIO only speak path-style, and R2 accepts it, so this is the
 * one form that works everywhere without a per-provider branch.
 */
export function objectUrl(key: string): string {
  return `${endpoint}/${env.S3_BUCKET}/${key}`
}

/** The object's key, back out of a stored URL. Null if it is not one of ours. */
export function keyFromUrl(value: string): string | null {
  const base = `${endpoint}/${env.S3_BUCKET}/`
  if (!value.startsWith(base)) return null
  const key = decodeURIComponent(value.slice(base.length))
  // A key that climbs out of the prefix is either a bug or an attempt.
  if (!key.startsWith(`${PREFIX}/`) || key.includes('..')) return null
  return key
}

/**
 * Is this a URL on OUR store, rather than any URL at all?
 *
 * The field it guards is rendered to a reviewer as a link they are expected to
 * open. An open field there is an attack on the secretariat, not on the
 * applicant: a URL pointing anywhere would have somebody in the OC clicking it
 * because the workflow told them to.
 */
export function isStorageUrl(value: string): boolean {
  if (!storageEnabled) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return keyFromUrl(`${url.origin}${url.pathname}`) !== null
}

/**
 * A key nobody else can guess or collide with.
 *
 * Two applicants both uploading "payment.jpg" must not overwrite each other,
 * and a predictable path would let anyone replace somebody else's proof — or
 * read it, if the bucket were ever made public by mistake.
 */
export function newUploadKey(contentType: AllowedUploadType): string {
  return `${PREFIX}/${randomUUID()}.${EXTENSION[contentType]}`
}

async function sign(key: string, method: 'PUT' | 'GET', ttlMs: number, contentType?: string): Promise<string> {
  if (!client) throw new Error('Object storage is not configured on this server.')

  const url = new URL(objectUrl(key))
  // Signed into the query string rather than a header, because the browser has
  // to be able to use this URL on its own — it has no way to add an
  // Authorization header it never saw.
  url.searchParams.set('X-Amz-Expires', String(Math.floor(ttlMs / 1000)))

  /*
    The content type is NOT part of the signature, and it is worth being exact
    about that rather than assuming otherwise.

    With `signQuery`aws4fetch signs the host header and nothing else, so this
    URL authorises writing these bytes to this key — it does not constrain what
    the bytes are. It is passed anyway because S3 stores it as the object's
    content type, which is what makes the screenshot render in a reviewer's
    browser instead of downloading as a file.

    What actually bounds this endpoint is elsewhere and does not depend on the
    signature: the key is chosen here and is unguessable, the declared type and
    size are validated before anything is signed, the request is rate limited,
    the bucket is private, and the URL only becomes a record if a registration
    is submitted carrying it. Binding the type would not have stopped the one
    real abuse — uploading junk correctly labelled `image/png`.
  */
  const signed = await client.sign(
    new Request(url.toString(), {
      method,
      ...(contentType ? { headers: { 'content-type': contentType } } : {}),
    }),
    { aws: { signQuery: true } },
  )
  return signed.url
}

/** How long the browser has to finish putting the file, from the moment it asks. */
const PUT_TTL_MS = 30 * 60 * 1000

export async function presignPut(
  key: string,
  contentType: AllowedUploadType,
): Promise<{ uploadUrl: string; fileUrl: string; contentType: AllowedUploadType }> {
  return {
    uploadUrl: await sign(key, 'PUT', PUT_TTL_MS, contentType),
    fileUrl: objectUrl(key),
    contentType,
  }
}

/**
 * A short-lived read URL for one screenshot, for a reviewer in the ops hub.
 *
 * Deliberately brief: it is a credential with a clock on it, and it ends up in
 * a browser's history, in whatever the reviewer pastes it into, and in any
 * proxy log along the way.
 */
export async function presignGet(key: string, ttlMs: number): Promise<string> {
  return sign(key, 'GET', ttlMs)
}
