/**
 * Creates the first ADMIN account, once, on a database that has none.
 *
 * There is no signup page by design, so a fresh deployment would otherwise have
 * a working ops hub that nobody can sign in to — and the connection string is
 * marked sensitive in Vercel, so it cannot be read back locally to seed by
 * hand. This runs during the build, where the credentials do exist.
 *
 * It is deliberately not `prisma/seed.ts`. That seeds two fixed accounts and is
 * a development convenience; this is a one-shot bootstrap that refuses to act
 * on a database that already has users, so a later deploy can never resurrect a
 * deleted account or surprise anyone with a second one.
 */
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
    // A failure here must not silently ship a hub nobody can enter.
    console.error('[bootstrap] failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
