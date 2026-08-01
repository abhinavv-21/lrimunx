import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import request from 'supertest'
import type { Test } from 'supertest'
import type { Express } from 'express'
import type { PrismaClient } from '@prisma/client'

/**
 * Boots the API in-process for the integration suite.
 *
 * No server is started and no port is bound: createApp() returns an Express
 * app and supertest drives it directly, so src/index.ts and src/serverless.ts
 * stay out of the test path entirely.
 *
 * Everything here is arranged so that `npm test` on a laptop with no
 * PostgreSQL still exits green — see bootApi().
 */

const here = path.dirname(fileURLToPath(import.meta.url))
/** Same file config/env.ts reads, resolved from the same depth. */
const ENV_FILE = path.resolve(here, '../../../../.env')

const PROBE_TIMEOUT_MS = 5_000

const PLACEHOLDER = /^replace-me/i

/**
 * The subset of config/env.ts we have to re-check by hand.
 *
 * config/env.ts calls process.exit(1) when configuration is invalid. That is
 * right for a server and fatal for a test worker: importing app.js with a half
 * filled .env would kill the process mid-run and take the pure unit suites
 * down with it, with no report of what happened. So the values are checked
 * here first and the integration suite skips with a readable reason instead of
 * ever reaching that exit.
 */
const REQUIRED_ENV: ReadonlyArray<{ key: string; minLength: number }> = [
  { key: 'DATABASE_URL', minLength: 1 },
  { key: 'JWT_SECRET', minLength: 32 },
  { key: 'JWT_REFRESH_SECRET', minLength: 32 },
  { key: 'GOOGLE_SHEETS_WEBHOOK_SECRET', minLength: 16 },
]

function configurationProblem(): string | null {
  for (const { key, minLength } of REQUIRED_ENV) {
    const value = process.env[key] ?? ''
    if (value.length === 0) return `${key} is not set`
    if (value.length < minLength) return `${key} is shorter than ${minLength} characters`
    if (PLACEHOLDER.test(value)) return `${key} is still the example placeholder`
  }
  return null
}

async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not answer within ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([work, expiry])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/* ---------------------------- Client addresses ---------------------------- */

/**
 * Rate limiting is per-IP and its store lives in this process, so a suite that
 * sends every request from one address exhausts the budget and starts failing
 * on 429s that have nothing to do with what is being tested. In particular
 * /public/register allows five submissions per fifteen minutes.
 *
 * Rather than loosening a production limit for the benefit of the tests, each
 * call presents its own synthetic client address and therefore its own bucket.
 * That works because the harness sets TRUST_PROXY=1 before the app is built
 * (see bootApi), which is the same setting a deployment behind Vercel or a
 * single nginx uses, and because /public/register keys on req.ip when the
 * platform-vouched x-vercel-forwarded-for header is absent — as it is here.
 *
 * A test that wants to exercise a limit pins one address across several calls
 * by passing `from`.
 *
 * 198.18.0.0/15 is reserved for benchmarking, so these can never collide with
 * a real address that turns up in the data.
 */
let issuedAddresses = 0

export function nextClientAddress(): string {
  issuedAddresses += 1
  return `198.18.${Math.floor(issuedAddresses / 254) % 254}.${(issuedAddresses % 254) + 1}`
}

/* ---------------------------------- API ----------------------------------- */

export type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete'

export interface RequestOptions {
  /** Access token to present. Omitted means an unauthenticated call. */
  token?: string
  /** Pin the client address, e.g. to drive a rate limiter deliberately. */
  from?: string
}

export interface Api {
  app: Express
  prisma: PrismaClient
  /** One HTTP call against the in-process app. Chain .send()/.set() as usual. */
  request(method: HttpMethod, url: string, options?: RequestOptions): Test
  /** Signs in over /auth/login and returns the access token. */
  signIn(username: string, password: string): Promise<string>
}

export type Boot = { ready: true; api: Api } | { ready: false; reason: string }

function buildRequest(app: Express, method: HttpMethod, url: string, options: RequestOptions = {}): Test {
  const test = request(app)[method](url).set('X-Forwarded-For', options.from ?? nextClientAddress())
  return options.token ? test.set('Authorization', `Bearer ${options.token}`) : test
}

interface LoginResponse {
  accessToken: string
}

/**
 * Brings up the app and reports whether the integration suite can run.
 *
 * Callers use the result with describe.skipIf so a missing database skips the
 * suite loudly but harmlessly. Nothing that could exit the process or hang on
 * an unreachable host is imported until the checks above have passed, which is
 * why app.js and lib/prisma.js are imported dynamically rather than at the top
 * of the file.
 */
export async function bootApi(): Promise<Boot> {
  dotenv.config({ path: ENV_FILE })

  const problem = configurationProblem()
  if (problem) return { ready: false, reason: problem }

  // Set before app.js is imported, because config/env.ts reads process.env
  // once at module load. Only when nothing upstream has an opinion.
  if (process.env['TRUST_PROXY'] === undefined) process.env['TRUST_PROXY'] = '1'

  let prisma: PrismaClient | undefined
  try {
    prisma = (await import('../lib/prisma.js')).prisma
    await withTimeout(prisma.$queryRawUnsafe('SELECT 1'), PROBE_TIMEOUT_MS, 'PostgreSQL')
  } catch (error) {
    // Leave no half-open pool behind, or the worker never exits.
    await prisma?.$disconnect().catch(() => undefined)
    // Prisma's connection errors open with a blank line and a "Invalid
    // prisma.x() invocation:" preamble; the sentence worth printing is the
    // first line after it that is not itself a heading.
    const raw = error instanceof Error ? error.message : String(error)
    const message =
      raw
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.endsWith(':')) ?? 'no detail given'
    return { ready: false, reason: `PostgreSQL is unreachable — ${message}` }
  }

  const { createApp } = await import('../app.js')
  const app = createApp()
  const client = prisma

  return {
    ready: true,
    api: {
      app,
      prisma: client,
      request: (method, url, options) => buildRequest(app, method, url, options),
      async signIn(username, password) {
        const response = await buildRequest(app, 'post', '/api/v1/auth/login').send({ username, password })
        if (response.status !== 200) {
          throw new Error(`Sign-in failed for ${username}: ${response.status} ${response.text}`)
        }
        return (response.body as LoginResponse).accessToken
      },
    },
  }
}
