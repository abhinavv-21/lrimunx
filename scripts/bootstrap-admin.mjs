import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!username || !password) {
    console.log('[bootstrap] SEED_ADMIN_* not set — skipping. Nothing to do.')
    return
  }

  const existing = await prisma.user.count()
  if (existing > 0) {
    console.log(`[bootstrap] ${existing} account(s) already exist — leaving them alone.`)
    return
  }

  await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      fullName: 'Secretariat',
      role: 'ADMIN',
    },
  })

  console.log(`[bootstrap] created the first ADMIN account: ${username}`)
  console.log('[bootstrap] change this password on first sign-in, then remove SEED_ADMIN_PASSWORD.')
}

main()
  .catch((error) => {
    console.error('[bootstrap] failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
