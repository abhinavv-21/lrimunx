import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`)
  return value
}

/**
 * Seeds the two sign-in accounts and nothing else.
 *
 * Delegates, committees and logistics requests are deliberately NOT seeded —
 * the conference data is entered through the app. Set SEED_COMMITTEES=true if
 * you want the six standard committees created for you as a starting point.
 */
const STANDARD_COMMITTEES = [
  { name: 'United Nations Security Council', code: 'UNSC', totalSeats: 15 },
  { name: 'Disarmament and International Security Committee', code: 'DISEC', totalSeats: 40 },
  { name: 'United Nations Human Rights Council', code: 'UNHRC', totalSeats: 35 },
  { name: 'Economic and Social Council', code: 'ECOSOC', totalSeats: 30 },
  { name: 'World Health Organization', code: 'WHO', totalSeats: 28 },
  { name: 'United Nations Environment Programme', code: 'UNEP', totalSeats: 30 },
]

async function main() {
  console.log('Seeding LRI MUN X Operations Hub…')

  const adminUsername = requireEnv('SEED_ADMIN_USERNAME')
  const contributorUsername = requireEnv('SEED_CONTRIBUTOR_USERNAME')
  const adminHash = await bcrypt.hash(requireEnv('SEED_ADMIN_PASSWORD'), 12)
  const contributorHash = await bcrypt.hash(requireEnv('SEED_CONTRIBUTOR_PASSWORD'), 12)

  await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: { username: adminUsername, passwordHash: adminHash, fullName: 'Secretariat Desk', role: Role.ADMIN },
  })

  await prisma.user.upsert({
    where: { username: contributorUsername },
    update: {},
    create: {
      username: contributorUsername,
      passwordHash: contributorHash,
      fullName: 'Logistics Volunteer',
      role: Role.CONTRIBUTOR,
    },
  })

  if (process.env['SEED_COMMITTEES'] === 'true') {
    for (const committee of STANDARD_COMMITTEES) {
      await prisma.committee.upsert({
        where: { code: committee.code },
        update: {},
        create: committee,
      })
    }
  }

  console.log('Seed complete:', {
    users: await prisma.user.count(),
    committees: await prisma.committee.count(),
    delegates: await prisma.delegate.count(),
    requests: await prisma.logisticsReq.count(),
  })
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
