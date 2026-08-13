import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import request from 'supertest'
import type { Test } from 'supertest'
import type { Express } from 'express'
import type { PrismaClient } from '@prisma/client'

const here = path.dirname(fileURLToPath(import.meta.url))

const ENV_FILE = path.resolve(here, '../../../../.env')

const PROBE_TIMEOUT_MS = 5_000

const PLACEHOLDER = /^replace-me/i

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

let issuedAddresses = 0

export function nextClientAddress(): string {
  issuedAddresses += 1
  return `198.18.${Math.floor(issuedAddresses / 254) % 254}.${(issuedAddresses % 254) + 1}`
}

export type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete'

export interface RequestOptions {
  token?: string

  from?: string
}

export interface Api {
  app: Express
  prisma: PrismaClient

  request(method: HttpMethod, url: string, options?: RequestOptions): Test

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

export async function bootApi(): Promise<Boot> {
  dotenv.config({ path: ENV_FILE })

  const problem = configurationProblem()
  if (problem) return { ready: false, reason: problem }

  if (process.env['TRUST_PROXY'] === undefined) process.env['TRUST_PROXY'] = '1'

  let prisma: PrismaClient | undefined
  try {
    prisma = (await import('../lib/prisma.js')).prisma
    await withTimeout(prisma.$queryRawUnsafe('SELECT 1'), PROBE_TIMEOUT_MS, 'PostgreSQL')
  } catch (error) {
    await prisma?.$disconnect().catch(() => undefined)

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
