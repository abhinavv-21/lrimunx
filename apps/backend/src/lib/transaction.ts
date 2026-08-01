import { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'
import { ApiError } from './errors.js'
import type { PrismaTransaction } from './prisma.js'

/** Postgres serialization failure / deadlock — safe to retry the whole block. */
const RETRYABLE = new Set(['P2034'])

/**
 * Runs a block at SERIALIZABLE isolation, retrying on serialization failures.
 *
 * Capacity checks are read-then-write: counting assignments and inserting one
 * are only safe together if a concurrent transaction cannot slip an insert
 * between them. Postgres will abort one of two conflicting serializable
 * transactions rather than let a committee exceed totalSeats, and we retry the
 * loser. The (committeeId, country) unique constraint covers double-booking at
 * the database level regardless of isolation.
 */
export async function runSerializable<T>(
  work: (tx: PrismaTransaction) => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10_000,
      })
    } catch (error) {
      lastError = error
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined
      if (!code || !RETRYABLE.has(code) || attempt === attempts) throw error
      // Brief backoff before retrying the conflicting transaction.
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt))
    }
  }

  throw lastError instanceof Error
    ? lastError
    : ApiError.conflict('The record was modified concurrently. Try again.')
}
