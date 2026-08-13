import { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'
import { ApiError } from './errors.js'
import type { PrismaTransaction } from './prisma.js'

const RETRYABLE = new Set(['P2034'])

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

      await new Promise((resolve) => setTimeout(resolve, 25 * attempt))
    }
  }

  throw lastError instanceof Error
    ? lastError
    : ApiError.conflict('The record was modified concurrently. Try again.')
}
