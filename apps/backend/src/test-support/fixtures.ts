import bcrypt from 'bcryptjs'
import { AttendanceStatus, RequestCategory, Role } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { generateReference } from '../lib/registrations.js'

export const NS = {
  username: 'zz_',
  email: 'zz.',
  displayName: 'ZZ ',
  committeeCode: 'ZZ',
  pushEndpoint: 'https://zz-push.invalid/',
} as const

const RUN = Date.now().toString(36)

export const FIXTURE_PASSWORD = 'zz-harness-2026-Kathmandu'

export interface Fixtures {
  adminId: string
  adminUsername: string
  contributorId: string
  contributorUsername: string
  password: string

  committeeId: string

  delegateId: string

  registrationId: string

  logisticsRequestId: string
}

export function nsEmail(local: string): string {
  return `${NS.email}${local}.${RUN}@lrimunx.test`
}

export async function seedFixtures(prisma: PrismaClient): Promise<Fixtures> {
  const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10)

  const admin = await prisma.user.create({
    data: {
      username: `${NS.username}admin_${RUN}`,
      fullName: `${NS.displayName}Harness Admin`,
      role: Role.ADMIN,
      passwordHash,
    },
  })

  const contributor = await prisma.user.create({
    data: {
      username: `${NS.username}contrib_${RUN}`,
      fullName: `${NS.displayName}Harness Contributor`,
      role: Role.CONTRIBUTOR,
      passwordHash,
    },
  })

  const committee = await prisma.committee.create({
    data: {
      name: `${NS.displayName}DISEC Rehearsal ${RUN}`,
      code: `${NS.committeeCode}${RUN.toUpperCase()}`.slice(0, 16),
      totalSeats: 2,
    },
  })

  const delegate = await prisma.delegate.create({
    data: {
      fullName: `${NS.displayName}Aarav Shrestha`,
      email: nsEmail('aarav'),
      phone: '+977 9812345678',
      schoolName: 'Ridge International School',
      grade: '11',
      committeePreference: 'DISEC',
      attendanceStatus: AttendanceStatus.ABSENT,
    },
  })

  const registration = await prisma.registration.create({
    data: {
      reference: generateReference(),
      fullName: `${NS.displayName}Nisha Gurung`,
      email: nsEmail('nisha'),
      phone: '+977 9801122334',
      schoolName: 'Ridge International School',
      grade: '12',
      committeePreference: 'UNHRC',
    },
  })

  const logisticsRequest = await prisma.logisticsReq.create({
    data: {
      title: `${NS.displayName}Placard request for UNHRC`,
      category: RequestCategory.PLACARD,
      description: 'Two replacement placards for the second session.',
      committeeId: committee.id,
      createdById: contributor.id,
    },
  })

  return {
    adminId: admin.id,
    adminUsername: admin.username,
    contributorId: contributor.id,
    contributorUsername: contributor.username,
    password: FIXTURE_PASSWORD,
    committeeId: committee.id,
    delegateId: delegate.id,
    registrationId: registration.id,
    logisticsRequestId: logisticsRequest.id,
  }
}

export async function sweepNamespace(prisma: PrismaClient): Promise<void> {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: NS.username } },
    select: { id: true },
  })
  const committees = await prisma.committee.findMany({
    where: { code: { startsWith: NS.committeeCode } },
    select: { id: true },
  })
  const delegates = await prisma.delegate.findMany({
    where: { email: { startsWith: NS.email } },
    select: { id: true },
  })

  const userIds = users.map((row) => row.id)
  const committeeIds = committees.map((row) => row.id)
  const delegateIds = delegates.map((row) => row.id)

  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.pushSub.deleteMany({ where: { endpoint: { startsWith: NS.pushEndpoint } } })
  await prisma.logisticsReq.deleteMany({
    where: {
      OR: [
        { createdById: { in: userIds } },
        { committeeId: { in: committeeIds } },
        { title: { startsWith: NS.displayName } },
      ],
    },
  })
  await prisma.registration.deleteMany({ where: { email: { startsWith: NS.email } } })
  await prisma.award.deleteMany({
    where: { OR: [{ committeeId: { in: committeeIds } }, { delegateId: { in: delegateIds } }] },
  })
  await prisma.assignment.deleteMany({
    where: {
      OR: [
        { committeeId: { in: committeeIds } },
        { assignedById: { in: userIds } },
        { delegateId: { in: delegateIds } },
      ],
    },
  })
  await prisma.delegate.deleteMany({ where: { id: { in: delegateIds } } })
  await prisma.committee.deleteMany({ where: { id: { in: committeeIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

export async function removeFixtures(prisma: PrismaClient, _fixtures: Fixtures): Promise<void> {
  await sweepNamespace(prisma)
}

export interface TableCounts {
  user: number
  delegate: number
  committee: number
  committeeCountry: number
  assignment: number
  registration: number
  logisticsReq: number
  award: number
  auditLog: number
  setting: number
  pushSub: number
  session: number
}

export async function countAllTables(prisma: PrismaClient): Promise<TableCounts> {
  const [user, delegate, committee, committeeCountry, assignment, registration, logisticsReq, award, auditLog, setting, pushSub, session] =
    await Promise.all([
      prisma.user.count(),
      prisma.delegate.count(),
      prisma.committee.count(),
      prisma.committeeCountry.count(),
      prisma.assignment.count(),
      prisma.registration.count(),
      prisma.logisticsReq.count(),
      prisma.award.count(),
      prisma.auditLog.count(),
      prisma.setting.count(),
      prisma.pushSub.count(),
      prisma.session.count(),
    ])

  return { user, delegate, committee, committeeCountry, assignment, registration, logisticsReq, award, auditLog, setting, pushSub, session }
}
