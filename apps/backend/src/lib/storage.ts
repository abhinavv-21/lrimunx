import { AwsClient } from 'aws4fetch'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'

export const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number]

const EXTENSION: Record<AllowedUploadType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

const PREFIX = 'payment-proofs'

const client = env.s3UploadsEnabled
  ? new AwsClient({
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      service: 's3',
      region: env.S3_REGION,
    })
  : null

const endpoint = env.S3_ENDPOINT.replace(/\/+$/, '')

export const storageEnabled = env.s3UploadsEnabled

export function objectUrl(key: string): string {
  return `${endpoint}/${env.S3_BUCKET}/${key}`
}

export function keyFromUrl(value: string): string | null {
  const base = `${endpoint}/${env.S3_BUCKET}/`
  if (!value.startsWith(base)) return null
  const key = decodeURIComponent(value.slice(base.length))

  if (!key.startsWith(`${PREFIX}/`) || key.includes('..')) return null
  return key
}

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

export function newUploadKey(contentType: AllowedUploadType): string {
  return `${PREFIX}/${randomUUID()}.${EXTENSION[contentType]}`
}

async function sign(key: string, method: 'PUT' | 'GET', ttlMs: number, contentType?: string): Promise<string> {
  if (!client) throw new Error('Object storage is not configured on this server.')

  const url = new URL(objectUrl(key))

  url.searchParams.set('X-Amz-Expires', String(Math.floor(ttlMs / 1000)))

  const signed = await client.sign(
    new Request(url.toString(), {
      method,
      ...(contentType ? { headers: { 'content-type': contentType } } : {}),
    }),
    { aws: { signQuery: true } },
  )
  return signed.url
}

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

export async function presignGet(key: string, ttlMs: number): Promise<string> {
  return sign(key, 'GET', ttlMs)
}
