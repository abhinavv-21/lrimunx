import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { lriMunPrisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.lriMunPrisma ?? new PrismaClient({ log: ['warn', 'error'] })

globalForPrisma.lriMunPrisma = prisma

export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>
