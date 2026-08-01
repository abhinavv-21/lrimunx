import { PrismaClient } from '@prisma/client'

/**
 * One PrismaClient per process, parked on globalThis.
 *
 * On Vercel this app runs as a serverless function: many short-lived
 * instances, each re-importing this module on a cold start and reusing the
 * module cache while warm. Constructing a client per module load opens a fresh
 * pool every time an instance spins up and exhausts the Postgres connection
 * limit under any real traffic. The global holds the client for the life of
 * the instance instead, and locally it survives tsx's watch reloads.
 *
 * DATABASE_URL must be a POOLED connection string in serverless — PgBouncer,
 * Supabase's pooler or Prisma Accelerate. Reusing one client per instance
 * bounds the connections each instance opens, not how many instances exist, so
 * a direct connection still runs out of slots however careful this file is.
 */
const globalForPrisma = globalThis as unknown as { lriMunPrisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.lriMunPrisma ?? new PrismaClient({ log: ['warn', 'error'] })

globalForPrisma.lriMunPrisma = prisma

export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>
