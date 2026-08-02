import bcrypt from 'bcryptjs'
import { AttendanceStatus, RequestCategory, Role } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { generateReference } from '../lib/registrations.js'

/**
 * Throwaway records for the integration suite.
 *
 * The database this runs against is the conference's real one. Nothing here
 * touches a record it did not create, and everything it creates carries a
 * namespace no genuine row can collide with:
 *
 *   users        zz_…      usernames
 *   people       zz.…      email addresses
 *   display text ZZ …      names and titles
 *   committees   ZZ…       codes
 *
 * The run id keeps two runs — or a run and the wreckage of a crashed one —
 * from fighting over the same unique columns.
 */

export const NS = {
  username: 'zz_',
  email: 'zz.',
  displayName: 'ZZ ',
  committeeCode: 'ZZ',
  pushEndpoint: 'https://zz-push.invalid/',
} as const

const RUN = Date.now().toString(36)

/** Long enough for loginSchema (8) and createUserSchema (10). */
export const FIXTURE_PASSWORD = 'zz-harness-2026-Kathmandu'

export interface Fixtures {
  adminId: string
  adminUsername: string
  contributorId: string
  contributorUsername: string
  password: string
  /** A committee of our own, so no real room is ever counted or filled. */
  committeeId: string
  /** A delegate of our own, so no real delegate is ever checked in or edited. */
  delegateId: string
  /** A PENDING registration, for the reads a contributor legitimately keeps. */
  registrationId: string
  /** Filed by the contributor, so GET /logistics-requests/:id has a target. */
  logisticsRequestId: string
}

/** Namespaced email for a fixture or a submission body. */
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

/**
 * Removes everything carrying the namespace, whoever created it and whenever.
 *
 * Written against the namespace rather than against this run's ids on purpose.
 * A worker that dies mid-suite — which the vitest fork pool on Windows does
 * every few runs, with or without a database involved — never reaches afterAll,
 * and leaves two users, a committee, a logistics request and a handful of audit
 * rows sitting in the conference's own database. Those orphans are then part of
 * the *next* run's baseline census, so the census fails and the debris
 * accumulates rather than being noticed and cleared.
 *
 * Running this before the baseline is taken makes a run self-healing: it starts
 * from a database with no test residue in it, whatever happened last time.
 *
 * Nothing here can match a genuine record. Every filter is one of the prefixes
 * declared in NS, which is exactly why they exist.
 *
 * Order follows the foreign keys: audit and logistics rows reference a User, a
 * Registration references a Delegate, an Assignment references all three.
 */
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

/**
 * Removes this run's records. Kept as a named step because that is what the
 * suite means at the end of a run, but the work is the namespace sweep — the
 * ids it holds are a subset of what carries the namespace, and the rows the API
 * allocated ids for (a public submission, an approval's delegate, an audit row)
 * were never in `fixtures` to begin with.
 */
export async function removeFixtures(prisma: PrismaClient, _fixtures: Fixtures): Promise<void> {
  await sweepNamespace(prisma)
}

/* ------------------------------ Table counts ------------------------------ */

/**
 * A census of every table, taken before the suite seeds anything and again
 * after it has cleaned up. Equality is the proof that a run against the real
 * conference database left it exactly as it found it.
 */
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
}

export async function countAllTables(prisma: PrismaClient): Promise<TableCounts> {
  const [user, delegate, committee, committeeCountry, assignment, registration, logisticsReq, award, auditLog, setting, pushSub] =
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
    ])

  return { user, delegate, committee, committeeCountry, assignment, registration, logisticsReq, award, auditLog, setting, pushSub }
}
