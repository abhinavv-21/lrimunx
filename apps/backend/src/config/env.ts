import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

// The .env lives at the repository root, two levels above apps/backend.
const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(here, '../../../../.env') })

const PLACEHOLDER = /^replace-me/i

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /**
   * Attaches the exception message and stack to 5xx responses.
   *
   * Opt-in rather than derived from NODE_ENV, which defaults to 'development':
   * one unset variable on a public deployment would otherwise turn every
   * unhandled error into a disclosure of file paths and driver internals. You
   * have to ask for diagnostics; you cannot get them by forgetting something.
   */
  EXPOSE_ERROR_DETAILS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * How many reverse proxies sit in front of this process.
   *
   * 0 means none, and X-Forwarded-For is then ignored entirely. That is the
   * safe default: trusting the header when nothing upstream rewrites it lets a
   * caller pick their own identity, which resets the registration rate limiter
   * on every request and forges the IP recorded for abuse review. Set it to 1
   * on Vercel or behind a single nginx; raise it only for each additional hop
   * you actually control.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /**
   * Comma-separated allow-list. Two origins by default because two front ends
   * call this API: the ops hub on 5173 and the public conference website on
   * 5174, which posts the registration form. Production adds the deployed
   * origins here and nowhere else — CORS is configuration, not code.
   */
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173,http://localhost:5174'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').refine(
    (v) => !PLACEHOLDER.test(v),
    'JWT_SECRET is still set to the example placeholder',
  ),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters').refine(
    (v) => !PLACEHOLDER.test(v),
    'JWT_REFRESH_SECRET is still set to the example placeholder',
  ),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  GOOGLE_SHEETS_WEBHOOK_SECRET: z.string().min(16, 'GOOGLE_SHEETS_WEBHOOK_SECRET must be at least 16 characters'),

  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:ops@lrimunx.org'),

  /**
   * Read-write token for the Vercel Blob store that holds payment screenshots.
   *
   * Optional, and empty is a supported state rather than a misconfiguration:
   * local development has no blob store, and the registration form is expected
   * to work without one — the upload route answers 503 and the screenshot field
   * is simply not filled in. Vercel injects this automatically once a store is
   * linked to the project.
   */
  BLOB_READ_WRITE_TOKEN: z.string().default(''),

  /**
   * Passphrase that gates the bulk conference reset.
   *
   * Empty disables the feature entirely, which is the right default: a
   * deployment that never sets it cannot have its conference erased through the
   * API at all. Deliberately not a literal in the source — the repository is
   * public, and a reset passphrase committed to it is a published key.
   */
  DANGER_RESET_PASSPHRASE: z.string().default(''),
})

export type Env = z.infer<typeof envSchema> & { pushEnabled: boolean; blobUploadsEnabled: boolean }

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    // CLAUDE.md rule: halt immediately on missing configuration rather than
    // starting in a half-configured state.
    console.error(`\nEnvironment configuration is invalid:\n${issues}\n\nCopy .env.example to .env and fill in the missing values.\n`)
    process.exit(1)
  }

  const pushEnabled = Boolean(parsed.data.VAPID_PUBLIC_KEY && parsed.data.VAPID_PRIVATE_KEY)
  if (!pushEnabled) {
    console.warn('[env] VAPID keys are not set — Web Push notifications are disabled. Generate them with: npx web-push generate-vapid-keys')
  }

  // Not warned about. A machine with no blob store is the normal local case,
  // and the upload route says so in its own response.
  const blobUploadsEnabled = parsed.data.BLOB_READ_WRITE_TOKEN.length > 0

  return { ...parsed.data, pushEnabled, blobUploadsEnabled }
}

export const env = loadEnv()
export const isProduction = env.NODE_ENV === 'production'
