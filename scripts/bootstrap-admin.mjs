/**
 * Runs at the end of `npm run deploy`. Brings a fresh database up to the point
 * where someone can sign in and start allocating.
 *
 * Two jobs, both idempotent, so re-deploying is safe:
 *   1. Create the first ADMIN account, but only if no account exists at all.
 *   2. Create the committees, but never touch one that is already there.
 *
 * The committee list is imported straight from apps/site/src/data/committees.js
 * rather than copied, so a production deploy cannot disagree with the site.
 * (prisma/seed.ts keeps its own copy for local development because tsx runs it
 * inside the Prisma workspace; `npm run check:committees` guards that one.)
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

import { COMMITTEES } from '../apps/site/src/data/committees.js'

const prisma = new PrismaClient()

async function bootstrapAdmin() {
  const username = process.env.SEED_ADMIN_USERNAME
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!username || !password) {
    console.log('[bootstrap] SEED_ADMIN_* not set — skipping the first account.')
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
      // The first account owns the deployment: settings, the danger zone and
      // the restart button answer to isOwner and to nothing else, so creating
      // it without the flag would produce a hub whose owner-only screens have
      // no owner and cannot be reached in order to appoint one.
      isOwner: true,
      canManageUsers: true,
    },
  })

  console.log(`[bootstrap] created the first ADMIN account: ${username}`)
  console.log('[bootstrap] change this password on first sign-in, then remove SEED_ADMIN_PASSWORD.')
}

async function bootstrapCommittees() {
  let created = 0
  let existing = 0

  for (const committee of COMMITTEES) {
    // `update: {}` on purpose. Once a committee exists the secretariat owns it:
    // if they have raised UNSC from 15 seats to 18 in the hub, a re-deploy must
    // not quietly put it back.
    const before = await prisma.committee.findUnique({ where: { code: committee.code } })

    await prisma.committee.upsert({
      where: { code: committee.code },
      update: {},
      create: {
        code: committee.code,
        name: committee.name,
        totalSeats: committee.seats,
      },
    })

    if (before) existing += 1
    else created += 1
  }

  if (created > 0) console.log(`[bootstrap] created ${created} committee(s).`)
  if (existing > 0) console.log(`[bootstrap] ${existing} committee(s) already existed — left alone.`)
}

async function main() {
  await bootstrapAdmin()
  await bootstrapCommittees()

  const [users, committees] = await Promise.all([
    prisma.user.count(),
    prisma.committee.count(),
  ])

  console.log(`[bootstrap] ready: ${users} account(s), ${committees} committee(s).`)

  if (committees === 0) {
    console.warn('[bootstrap] WARNING: no committees. Delegates cannot be allocated.')
  }
}

main()
  .catch((error) => {
    console.error('[bootstrap] failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
