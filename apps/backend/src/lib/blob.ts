/**
 * blob.ts — the one place that knows how this deployment talks to Vercel Blob.
 *
 * The SDK resolves credentials itself: it prefers an explicit `token`, then the
 * runtime's OIDC token paired with `BLOB_STORE_ID`, then a
 * `BLOB_READ_WRITE_TOKEN` from the environment. Both routes reach the same
 * store; which one exists depends on when the store was created.
 *
 * The only thing that has to be said out loud is the token, and only when there
 * IS one — passing `token: ''` is not "no token", it is a token that fails, and
 * it short-circuits the OIDC branch before it is ever tried.
 */
import { env } from '../config/env.js'

/** Auth options to spread into any `@vercel/blob` call. Often empty, on purpose. */
export function blobAuth(): { token?: string } {
  return env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : {}
}

/**
 * BlobError carries no distinguishing class or `name` — it is a plain Error
 * subclass — so its own prefix is the only thing separating "the caller sent
 * nonsense" from "something under us broke".
 */
export const BLOB_ERROR_PREFIX = 'Vercel Blob: '

export function isBlobError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(BLOB_ERROR_PREFIX)
}
