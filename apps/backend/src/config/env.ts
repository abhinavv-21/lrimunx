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
})

export type Env = z.infer<typeof envSchema> & { pushEnabled: boolean }

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

  return { ...parsed.data, pushEnabled }
}

export const env = loadEnv()
export const isProduction = env.NODE_ENV === 'production'
