import type { Express } from 'express'
import { createApp } from './app.js'
import { initialisePush } from './lib/push.js'

/**
 * Serverless entry point — the handler Vercel imports.
 *
 * Deliberately no listen() and no process.exit: the platform owns the socket
 * and the lifecycle, and a function that kills its own process takes any
 * in-flight request with it. src/index.ts remains the local dev server and is
 * untouched.
 *
 * There is no prisma.$connect() either. The client connects lazily on first
 * query, which is what a cold start wants — an instance that receives a
 * request needing no database should not pay for a handshake.
 *
 * DATABASE_URL must be a POOLED connection string here (PgBouncer, Supabase's
 * pooler, Prisma Accelerate). Every warm instance holds its own pool, so a
 * direct Postgres connection will run out of slots as instances scale out,
 * regardless of the client singleton in lib/prisma.ts.
 */
initialisePush()

const app: Express = createApp()

export default app
