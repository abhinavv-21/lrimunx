import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`)
  return value
}

// Mirrors apps/site/src/data/committees.js, which is the source of truth.
// `npm run check:committees` fails if the two drift apart. Keep code, name and
// totalSeats identical; the rest of a committee (agenda, chair, blurb) is site
// copy and deliberately has no column here.
const STANDARD_COMMITTEES = [
  { name: 'United Nations Security Council', code: 'UNSC', totalSeats: 15 },
  { name: 'International Court of Justice', code: 'ICJ', totalSeats: 15 },
  { name: 'Economic and Social Council', code: 'ECOSOC', totalSeats: 40 },
  { name: 'Disarmament and International Security Committee', code: 'DISEC', totalSeats: 50 },
  { name: 'United Nations Office on Drugs and Crime', code: 'UNODC', totalSeats: 35 },
  { name: 'United Nations Human Rights Council', code: 'UNHRC', totalSeats: 45 },
  { name: 'United Nations High Commissioner for Refugees', code: 'UNHCR', totalSeats: 35 },
  { name: 'UN Women', code: 'UNWOMEN', totalSeats: 30 },
  { name: 'Federal Parliament of Nepal', code: 'FPN', totalSeats: 35 },
  { name: 'International Press', code: 'IP', totalSeats: 15 },
  { name: 'Economic and Financial Committee', code: 'ECOFIN', totalSeats: 40 },
  { name: 'Social, Humanitarian and Cultural Committee', code: 'SOCHUM', totalSeats: 45 },
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
