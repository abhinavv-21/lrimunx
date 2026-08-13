import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(here, '../../../../.env') })

const PLACEHOLDER = /^replace-me/i

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  EXPOSE_ERROR_DETAILS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173,http://localhost:5174'),
  SERVE_STATIC: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  STATIC_DIR: z.string().default(path.resolve(here, '../../../../dist')),
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
  S3_ENDPOINT: z.string().default(''),
  S3_BUCKET: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_REGION: z.string().default('auto'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_FROM: z.string().default(''),
  SMTP_REPLY_TO: z.string().default(''),
  DANGER_RESET_PASSPHRASE: z.string().default(''),
})

export type Env = z.infer<typeof envSchema> & {
  pushEnabled: boolean
  s3UploadsEnabled: boolean
  emailEnabled: boolean
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')

    console.error(`\nEnvironment configuration is invalid:\n${issues}\n\nCopy .env.example to .env and fill in the missing values.\n`)
    process.exit(1)
  }

  const pushEnabled = Boolean(parsed.data.VAPID_PUBLIC_KEY && parsed.data.VAPID_PRIVATE_KEY)
  if (!pushEnabled) {
    console.warn('[env] VAPID keys are not set — Web Push notifications are disabled. Generate them with: npx web-push generate-vapid-keys')
  }

  const s3UploadsEnabled = Boolean(
    parsed.data.S3_ENDPOINT &&
      parsed.data.S3_BUCKET &&
      parsed.data.S3_ACCESS_KEY_ID &&
      parsed.data.S3_SECRET_ACCESS_KEY,
  )

  const emailEnabled = Boolean(
    parsed.data.SMTP_HOST &&
      parsed.data.SMTP_USER &&
      parsed.data.SMTP_PASSWORD &&
      parsed.data.SMTP_FROM,
  )
  if (!emailEnabled) {
    console.warn(
      '[env] SMTP is not configured — approving a registration will not send a confirmation email.',
    )
  }

  return { ...parsed.data, pushEnabled, s3UploadsEnabled, emailEnabled }
}

export const env = loadEnv()
export const isProduction = env.NODE_ENV === 'production'
