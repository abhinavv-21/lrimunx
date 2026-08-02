import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AttendanceStatus, RegistrationStatus, Role } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { ApiErrorBody } from '../lib/errors.js'
import { REFERENCE_PATTERN, generateReference } from '../lib/registrations.js'
import type { PublicRegistrationAccepted } from './public.routes.js'
import { bootApi, type Api, type HttpMethod } from '../test-support/harness.js'
import {
  NS,
  countAllTables,
  nsEmail,
  removeFixtures,
  seedFixtures,
  sweepNamespace,
  type Fixtures,
  type TableCounts,
} from '../test-support/fixtures.js'

/**
 * End-to-end coverage of the guarantees the API is supposed to make, driven
 * over HTTP against a real database. The unit suites next door cover the pure
 * logic; what is checked here is what a caller can actually reach.
 *
 * Two things shape everything below.
 *
 * The database is the conference's own. Every record this file writes is
 * namespaced (see test-support/fixtures.ts) and removed in afterAll, which
 * then asserts a table-by-table census matches the one taken before the suite
 * started. Nothing reads, edits or deletes a row it did not create.
 *
 * The database is also optional. `npm test` has to stay green on a machine
 * with no PostgreSQL, so connectivity is probed once, up front, and the whole
 * suite skips with a reason rather than failing or hanging.
 */
const boot = await bootApi()

if (!boot.ready) {
  console.warn(
    `\n[integration] Skipping the API integration suite — ${boot.reason}.` +
      `\n[integration] The unit suites do not need a database. Start PostgreSQL and re-run to exercise these.\n`,
  )
}

let api: Api
let prisma: PrismaClient
let fixtures: Fixtures
let baseline: TableCounts
let adminToken: string
let contributorToken: string

/** Any valid uuid. Used where a route rejects the caller before it looks. */
const SYNTHETIC_UUID = '00000000-0000-4000-8000-000000000000'

const PUSH_ENDPOINT = `${NS.pushEndpoint}contributor-device`

/**
 * A screenshot URL shaped exactly as Vercel Blob returns one. Nothing is ever
 * fetched from it — only the host is load-bearing.
 */
const BLOB_URL = 'https://k3mq1zfwvbdxpnl8.private.blob.vercel-storage.com/payment-proof-9Kq2LmR4.png'

/**
 * Whether this machine has a blob store. Local development does not, and the
 * upload endpoint answers differently in the two cases by design, so the tests
 * that pin one answer skip in the other.
 */
const blobConfigured = Boolean(
  process.env['BLOB_READ_WRITE_TOKEN'] || process.env['BLOB_STORE_ID'],
)

/** A submission the public form would produce, with a namespaced address. */
function submission(email: string): Record<string, unknown> {
  return {
    fullName: `${NS.displayName}Prakriti Basnet`,
    email,
    phone: '+977 9812345678',
    schoolName: 'Ridge International School',
    grade: '11',
    committeePreference: 'DISEC',
    committeePreference2: 'UNHRC',
    // Strings, because that is what a browser number input posts.
    munsAttended: '4',
    awardsWon: '1',
    referralCode: 'RIDGE-MUNSOC',
    paymentProofUrl: BLOB_URL,
    dietaryNotes: 'Vegetarian meals only',
    // An untouched optional field arrives as "" from a browser, not as absent.
    accessibilityNotes: '',
  }
}

/** A PENDING registration created straight through Prisma, bypassing the limiter. */
async function pendingRegistration(local: string): Promise<{ id: string; email: string }> {
  const email = nsEmail(local)
  const row = await prisma.registration.create({
    data: {
      reference: generateReference(),
      fullName: `${NS.displayName}Review Case ${local}`,
      email,
      phone: '+977 9845001122',
      schoolName: 'Ridge International School',
      grade: '12',
      committeePreference: 'UNHRC',
      committeePreference2: 'DISEC',
      munsAttended: 6,
      awardsWon: 2,
      referralCode: 'RIDGE-MUNSOC',
      paymentProofUrl: BLOB_URL,
    },
    select: { id: true, email: true },
  })
  return row
}

describe.skipIf(!boot.ready)('API integration', () => {
  beforeAll(async () => {
    if (!boot.ready) throw new Error('The suite should have been skipped')
    api = boot.api
    prisma = api.prisma

    // Before the baseline, not after: a run that died mid-suite last time never
    // reached afterAll, and its orphans would otherwise be counted as part of
    // the conference's own data and then deleted out from under the census.
    await sweepNamespace(prisma)

    baseline = await countAllTables(prisma)
    fixtures = await seedFixtures(prisma)

    adminToken = await api.signIn(fixtures.adminUsername, fixtures.password)
    contributorToken = await api.signIn(fixtures.contributorUsername, fixtures.password)
  }, 30_000)

  afterAll(async () => {
    if (!boot.ready || !fixtures) return
    try {
      await removeFixtures(prisma, fixtures)
      // The point of the whole exercise: a run against the real conference
      // database leaves it exactly as it found it, row for row.
      expect(await countAllTables(prisma)).toEqual(baseline)
    } finally {
      await prisma.$disconnect()
    }
  }, 30_000)

  /* ======================================================================== */
  /* 1. The core guarantee                                                    */
  /* ======================================================================== */

  /**
   * A member of the public can apply. That is the entire extent of it: no
   * account, no role, no seat. Approval by an admin turns an application into
   * a Delegate, and a Delegate is still not a User.
   */
  describe('a public registration cannot become an account', () => {
    it('stores one PENDING Registration and creates no User', async () => {
      const email = nsEmail('prakriti')
      const usersBefore = await prisma.user.count()

      const response = await api
        .request('post', '/api/v1/public/register', { from: '198.51.100.7' })
        .send(submission(email))

      expect(response.status).toBe(201)
      const body = response.body as PublicRegistrationAccepted
      expect(body.status).toBe('received')
      expect(body.reference).toMatch(REFERENCE_PATTERN)

      const rows = await prisma.registration.findMany({ where: { email } })
      expect(rows).toHaveLength(1)
      expect(rows[0]?.status).toBe(RegistrationStatus.PENDING)
      expect(rows[0]?.reference).toBe(body.reference)
      expect(rows[0]?.delegateId).toBeNull()
      expect(rows[0]?.reviewedById).toBeNull()
      // Recorded for abuse review, and taken from the address the limiter keyed
      // on rather than from anything the body claimed.
      expect(rows[0]?.submittedIp).toBe('198.51.100.7')

      expect(await prisma.user.count()).toBe(usersBefore)
    })

    it('ignores every privileged field a submitter tries to set', async () => {
      const email = nsEmail('massassign')
      const usersBefore = await prisma.user.count()
      const injectedUsername = `${NS.username}injected_admin`

      const response = await api.request('post', '/api/v1/public/register').send({
        ...submission(email),
        // None of these are in publicRegistrationSchema. Zod strips unknown
        // keys and validate() replaces the body with the parsed result, so the
        // route never sees them — this test is what keeps that true.
        role: Role.ADMIN,
        username: injectedUsername,
        password: 'letmein-please-2026',
        passwordHash: '$2a$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN',
        status: RegistrationStatus.APPROVED,
        id: '11111111-1111-4111-8111-111111111111',
        reference: 'LMX-ZZZZZZ',
        reviewedById: fixtures.adminId,
        delegateId: fixtures.delegateId,
        createdAt: '2020-01-01T00:00:00.000Z',
        submittedIp: '10.0.0.1',
      })

      expect(response.status).toBe(201)

      const row = await prisma.registration.findFirstOrThrow({ where: { email } })
      expect(row.status).toBe(RegistrationStatus.PENDING)
      expect(row.id).not.toBe('11111111-1111-4111-8111-111111111111')
      expect(row.reference).not.toBe('LMX-ZZZZZZ')
      expect(row.reviewedById).toBeNull()
      expect(row.reviewedAt).toBeNull()
      expect(row.delegateId).toBeNull()
      expect(row.submittedIp).not.toBe('10.0.0.1')
      expect(row.createdAt.getUTCFullYear()).toBeGreaterThan(2020)

      expect(await prisma.user.count()).toBe(usersBefore)
      expect(await prisma.user.findUnique({ where: { username: injectedUsername } })).toBeNull()
    })

    it('ignores a nested relation write aimed at User', async () => {
      const email = nsEmail('nested')
      const usersBefore = await prisma.user.count()
      const delegatesBefore = await prisma.delegate.count()

      const response = await api.request('post', '/api/v1/public/register').send({
        ...submission(email),
        user: {
          create: {
            username: `${NS.username}nested_admin`,
            passwordHash: '$2a$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN',
            fullName: `${NS.displayName}Nested Admin`,
            role: Role.ADMIN,
          },
        },
        delegate: {
          create: {
            fullName: `${NS.displayName}Nested Delegate`,
            email: nsEmail('nested.delegate'),
            phone: '+977 9800000000',
            schoolName: 'Ridge International School',
            grade: '10',
          },
        },
      })

      expect(response.status).toBe(201)

      const row = await prisma.registration.findFirstOrThrow({ where: { email } })
      expect(row.delegateId).toBeNull()

      expect(await prisma.user.count()).toBe(usersBefore)
      expect(await prisma.delegate.count()).toBe(delegatesBefore)
      expect(await prisma.user.findUnique({ where: { username: `${NS.username}nested_admin` } })).toBeNull()
    })

    it('offers no signup route — creating a User needs an admin token', async () => {
      const usersBefore = await prisma.user.count()
      const wouldBeAccount = {
        username: `${NS.username}selfmade`,
        password: 'self-service-2026',
        fullName: `${NS.displayName}Self Made`,
        role: Role.ADMIN,
      }

      const direct = await api.request('post', '/api/v1/users').send(wouldBeAccount)
      expect(direct.status).toBe(401)

      // The paths a stranger would try next. Under /api/v1 an unmatched path
      // reaches the global auth guard before the 404 handler, so these answer
      // 401 rather than confirming which routes exist.
      for (const url of [
        '/api/v1/auth/register',
        '/api/v1/auth/signup',
        '/api/v1/register',
        '/api/v1/public/users',
      ]) {
        const guess = await api.request('post', url).send(wouldBeAccount)
        expect(guess.status).toBe(401)
      }

      expect(await prisma.user.count()).toBe(usersBefore)
    })

    it('mints a Delegate on approval — and no Assignment, no User', async () => {
      const registration = await pendingRegistration('approved')
      const usersBefore = await prisma.user.count()
      const assignmentsBefore = await prisma.assignment.count()

      const response = await api.request('post', `/api/v1/registrations/${registration.id}/approve`, {
        token: adminToken,
      })
      expect(response.status).toBe(200)

      const delegate = await prisma.delegate.findUniqueOrThrow({
        where: { email: registration.email },
        include: { assignment: true },
      })
      // Committee and country are a secretariat decision taken later on the
      // Allocations screen. Approval must not quietly consume a seat.
      expect(delegate.assignment).toBeNull()
      expect(delegate.committeePreference).toBe('UNHRC')
      expect(await prisma.assignment.count()).toBe(assignmentsBefore)
      expect(await prisma.user.count()).toBe(usersBefore)

      // The fallback and the experience figures follow the person, because
      // Allocations reads them when it decides which room they go into.
      expect(delegate.committeePreference2).toBe('DISEC')
      expect(delegate.munsAttended).toBe(6)
      expect(delegate.awardsWon).toBe(2)

      const after = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })
      expect(after.status).toBe(RegistrationStatus.APPROVED)
      expect(after.delegateId).toBe(delegate.id)
      expect(after.reviewedById).toBe(fixtures.adminId)
      // Who referred them and what they paid with are facts about the
      // application, not about the person, so they stay on the row that is
      // still linked rather than being copied onto the roster.
      expect(after.referralCode).toBe('RIDGE-MUNSOC')
      expect(after.paymentProofUrl).toBe(BLOB_URL)

      // CLAUDE.md rule 2 — an admin write leaves a trail.
      const trail = await prisma.auditLog.findMany({ where: { userId: fixtures.adminId } })
      expect(trail.some((row) => row.action === 'APPROVE' && row.entityId === registration.id)).toBe(true)
      expect(trail.some((row) => row.action === 'CREATE' && row.entityId === delegate.id)).toBe(true)
    })
  })

  /* ======================================================================== */
  /* 2. RBAC                                                                  */
  /* ======================================================================== */

  interface RouteCase {
    method: HttpMethod
    url: string
    body?: Record<string, unknown>
    /** What a CONTRIBUTOR should get. 403 for admin-only routes. */
    contributor: number
  }

  /**
   * The whole authenticated surface, one row per route.
   *
   * Kept as data rather than as a block per route so that adding an endpoint
   * without deciding its role is an obvious omission, and so the two questions
   * asked of every route — "is it shut to a stranger" and "is it shut to a
   * contributor" — are asked identically everywhere.
   */
  function adminOnlyRoutes(f: Fixtures): RouteCase[] {
    return [
      { method: 'post', url: '/api/v1/delegates', body: {}, contributor: 403 },
      { method: 'patch', url: `/api/v1/delegates/${f.delegateId}`, body: { grade: '12' }, contributor: 403 },
      { method: 'delete', url: `/api/v1/delegates/${f.delegateId}`, contributor: 403 },

      { method: 'post', url: `/api/v1/registrations/${f.registrationId}/approve`, contributor: 403 },
      { method: 'post', url: `/api/v1/registrations/${f.registrationId}/reject`, body: {}, contributor: 403 },
      { method: 'delete', url: `/api/v1/registrations/${f.registrationId}`, contributor: 403 },

      { method: 'post', url: '/api/v1/committees', body: {}, contributor: 403 },
      { method: 'patch', url: `/api/v1/committees/${f.committeeId}`, body: { totalSeats: 40 }, contributor: 403 },
      { method: 'delete', url: `/api/v1/committees/${f.committeeId}`, contributor: 403 },
      { method: 'post', url: `/api/v1/committees/${f.committeeId}/awards`, body: {}, contributor: 403 },
      {
        method: 'patch',
        url: `/api/v1/committees/${f.committeeId}/awards/${SYNTHETIC_UUID}`,
        body: { title: 'Best Delegate' },
        contributor: 403,
      },
      { method: 'delete', url: `/api/v1/committees/${f.committeeId}/awards/${SYNTHETIC_UUID}`, contributor: 403 },

      { method: 'post', url: '/api/v1/assignments', body: {}, contributor: 403 },
      { method: 'patch', url: `/api/v1/assignments/${SYNTHETIC_UUID}`, body: { country: 'France' }, contributor: 403 },
      { method: 'delete', url: `/api/v1/assignments/${SYNTHETIC_UUID}`, contributor: 403 },

      {
        method: 'patch',
        url: `/api/v1/logistics-requests/${f.logisticsRequestId}`,
        body: { status: 'RESOLVED' },
        contributor: 403,
      },
      { method: 'delete', url: `/api/v1/logistics-requests/${f.logisticsRequestId}`, contributor: 403 },

      {
        method: 'post',
        url: '/api/v1/attendance/bulk-check-in',
        body: { delegateIds: [f.delegateId], status: AttendanceStatus.CHECKED_IN },
        contributor: 403,
      },

      { method: 'get', url: '/api/v1/users', contributor: 403 },
      { method: 'post', url: '/api/v1/users', body: {}, contributor: 403 },
      { method: 'patch', url: `/api/v1/users/${f.adminId}`, body: { fullName: `${NS.displayName}Renamed` }, contributor: 403 },
      { method: 'delete', url: `/api/v1/users/${f.adminId}`, contributor: 403 },

      { method: 'get', url: '/api/v1/audit-logs', contributor: 403 },
      // Never sent with an admin token anywhere in this suite: it clears the
      // entire trail, including the conference's own 29 rows.
      { method: 'delete', url: '/api/v1/audit-logs', contributor: 403 },
      { method: 'get', url: `/api/v1/audit-logs/entity/Delegate/${f.delegateId}`, contributor: 403 },

      { method: 'get', url: '/api/v1/exports?dataset=delegates&format=xlsx', contributor: 403 },

      { method: 'put', url: '/api/v1/settings', body: { googleFormUrl: '' }, contributor: 403 },

      { method: 'post', url: '/api/v1/integrations/csv', body: { csv: 'fullName\n' }, contributor: 403 },
    ]
  }

  /** Routes a CONTRIBUTOR legitimately keeps. */
  function sharedRoutes(f: Fixtures): RouteCase[] {
    return [
      { method: 'get', url: '/api/v1/dashboard', contributor: 200 },
      { method: 'get', url: '/api/v1/delegates', contributor: 200 },
      { method: 'get', url: `/api/v1/delegates/${f.delegateId}`, contributor: 200 },
      { method: 'get', url: '/api/v1/registrations', contributor: 200 },
      { method: 'get', url: '/api/v1/registrations/stats', contributor: 200 },
      { method: 'get', url: `/api/v1/registrations/${f.registrationId}`, contributor: 200 },
      { method: 'get', url: '/api/v1/committees', contributor: 200 },
      { method: 'get', url: `/api/v1/committees/${f.committeeId}`, contributor: 200 },
      { method: 'get', url: `/api/v1/committees/${f.committeeId}/awards`, contributor: 200 },
      { method: 'get', url: '/api/v1/assignments', contributor: 200 },
      { method: 'get', url: '/api/v1/logistics-requests', contributor: 200 },
      { method: 'get', url: `/api/v1/logistics-requests/${f.logisticsRequestId}`, contributor: 200 },
      { method: 'get', url: '/api/v1/attendance/summary', contributor: 200 },
      { method: 'get', url: '/api/v1/settings', contributor: 200 },
      { method: 'get', url: '/api/v1/push/public-key', contributor: 200 },
      { method: 'get', url: '/api/v1/auth/me', contributor: 200 },
      { method: 'post', url: '/api/v1/auth/logout', contributor: 204 },
      {
        method: 'post',
        url: '/api/v1/push/subscribe',
        body: { endpoint: PUSH_ENDPOINT, keys: { p256dh: 'zz-p256dh-test-key-value', auth: 'zz-auth-key' } },
        contributor: 201,
      },
      { method: 'post', url: '/api/v1/push/unsubscribe', body: { endpoint: PUSH_ENDPOINT }, contributor: 204 },
    ]
  }

  /** The two writes a contributor owns get their own tests, further down. */
  const contributorWrites: RouteCase[] = [
    { method: 'post', url: '/api/v1/logistics-requests', body: {}, contributor: 422 },
    { method: 'post', url: '/api/v1/attendance/check-in', body: {}, contributor: 422 },
  ]

  function allAuthenticatedRoutes(f: Fixtures): RouteCase[] {
    return [...adminOnlyRoutes(f), ...sharedRoutes(f), ...contributorWrites]
  }

  describe('RBAC', () => {
    it('refuses every authenticated route without a token', async () => {
      const routes = allAuthenticatedRoutes(fixtures)
      // A guard that only covers most of the surface is not a guard.
      expect(routes.length).toBeGreaterThanOrEqual(39)

      const leaked: string[] = []
      for (const route of routes) {
        const response = await api.request(route.method, route.url).send(route.body ?? {})
        if (response.status !== 401) leaked.push(`${route.method.toUpperCase()} ${route.url} → ${response.status}`)
      }

      expect(leaked).toEqual([])
    }, 60_000)

    it('rejects a token this API did not sign', async () => {
      // Signed with a different secret, otherwise well formed.
      const forged =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiJ6ei1mb3JnZWQiLCJ1c2VybmFtZSI6Inp6X2ZvcmdlZCIsImZ1bGxOYW1lIjoiWlogRm9yZ2VkIiwicm9sZSI6IkFETUlOIn0.' +
        'Ai9Sm1zJq3Yl0iJ3hVQ0k4rQm2xQ8Xg1n8B0mZ8oO1c'

      const response = await api.request('get', '/api/v1/users', { token: forged })
      expect(response.status).toBe(401)
      expect((response.body as ApiErrorBody).error).toMatch(/invalid/i)
    })

    it('refuses a CONTRIBUTOR on every admin-only route', async () => {
      const admitted: string[] = []
      for (const route of adminOnlyRoutes(fixtures)) {
        const response = await api
          .request(route.method, route.url, { token: contributorToken })
          .send(route.body ?? {})
        if (response.status !== 403) admitted.push(`${route.method.toUpperCase()} ${route.url} → ${response.status}`)
      }

      expect(admitted).toEqual([])
    }, 60_000)

    it('admits a CONTRIBUTOR on the routes the role is meant to keep', async () => {
      const refused: string[] = []
      for (const route of sharedRoutes(fixtures)) {
        const response = await api
          .request(route.method, route.url, { token: contributorToken })
          .send(route.body ?? {})
        if (response.status !== route.contributor) {
          refused.push(
            `${route.method.toUpperCase()} ${route.url} → ${response.status}, expected ${route.contributor}`,
          )
        }
      }

      expect(refused).toEqual([])
    }, 60_000)

    it('does not let a CONTRIBUTOR promote itself to ADMIN', async () => {
      // The escalation that matters: the role field is writable on this route,
      // and the only thing between a contributor and the whole console is the
      // router-level requireAdmin.
      const selfPromotion = await api
        .request('patch', `/api/v1/users/${fixtures.contributorId}`, { token: contributorToken })
        .send({ role: Role.ADMIN })
      expect(selfPromotion.status).toBe(403)

      const demoteAnAdmin = await api
        .request('patch', `/api/v1/users/${fixtures.adminId}`, { token: contributorToken })
        .send({ role: Role.CONTRIBUTOR })
      expect(demoteAnAdmin.status).toBe(403)

      const self = await prisma.user.findUniqueOrThrow({ where: { id: fixtures.contributorId } })
      expect(self.role).toBe(Role.CONTRIBUTOR)
      const admin = await prisma.user.findUniqueOrThrow({ where: { id: fixtures.adminId } })
      expect(admin.role).toBe(Role.ADMIN)
    })

    it('lets a CONTRIBUTOR file a logistics request', async () => {
      const title = `${NS.displayName}Placard request for DISEC`
      const response = await api
        .request('post', '/api/v1/logistics-requests', { token: contributorToken })
        .send({
          title,
          category: 'PLACARD',
          description: 'France placard was damaged during the first session.',
          committeeId: fixtures.committeeId,
        })

      expect(response.status).toBe(201)

      const created = await prisma.logisticsReq.findFirstOrThrow({ where: { title } })
      expect(created.createdById).toBe(fixtures.contributorId)
      expect(created.status).toBe('OPEN')
    })

    it('lets a CONTRIBUTOR check a delegate in, and records who did it', async () => {
      const response = await api
        .request('post', '/api/v1/attendance/check-in', { token: contributorToken })
        .send({ delegateId: fixtures.delegateId, status: AttendanceStatus.CHECKED_IN })

      expect(response.status).toBe(200)

      const delegate = await prisma.delegate.findUniqueOrThrow({ where: { id: fixtures.delegateId } })
      expect(delegate.attendanceStatus).toBe(AttendanceStatus.CHECKED_IN)

      // Attendance is the one write both roles share, so it is audited for
      // both — the desk needs to know who marked someone present.
      const trail = await prisma.auditLog.findMany({
        where: { userId: fixtures.contributorId, action: 'CHECK_IN', entityId: fixtures.delegateId },
      })
      expect(trail).toHaveLength(1)

      // Leave the fixture as it was found, so order cannot matter to anything else.
      await prisma.delegate.update({
        where: { id: fixtures.delegateId },
        data: { attendanceStatus: AttendanceStatus.ABSENT },
      })
    })

    it('keeps submission metadata for admins only', async () => {
      const asContributor = await api.request('get', `/api/v1/registrations/${fixtures.registrationId}`, {
        token: contributorToken,
      })
      expect(asContributor.status).toBe(200)
      expect(asContributor.body).not.toHaveProperty('submittedIp')
      expect(asContributor.body).not.toHaveProperty('userAgent')

      const asAdmin = await api.request('get', `/api/v1/registrations/${fixtures.registrationId}`, {
        token: adminToken,
      })
      expect(asAdmin.status).toBe(200)
      expect(asAdmin.body).toHaveProperty('submittedIp')
      expect(asAdmin.body).toHaveProperty('userAgent')
    })
  })

  /* ======================================================================== */
  /* 3. The public endpoint's contract                                        */
  /* ======================================================================== */

  describe('the public registration endpoint', () => {
    it('answers a duplicate exactly as it answers a first submission', async () => {
      // A 201/200 split used to answer "has this person applied to LRI MUN X?"
      // for anyone holding a school email list. The two responses must now be
      // indistinguishable in every respect a caller can observe.
      const email = nsEmail('duplicate')
      const from = '198.51.100.21'

      const first = await api.request('post', '/api/v1/public/register', { from }).send(submission(email))
      const second = await api.request('post', '/api/v1/public/register', { from }).send(submission(email))

      expect(second.status).toBe(first.status)
      expect(second.status).toBe(201)
      expect(Object.keys(second.body as object).sort()).toEqual(Object.keys(first.body as object).sort())
      expect((second.body as PublicRegistrationAccepted).status).toBe('received')
      expect(second.text).not.toMatch(/duplicate/i)
      // The re-submitter gets the code that is actually on their row.
      expect((second.body as PublicRegistrationAccepted).reference).toBe(
        (first.body as PublicRegistrationAccepted).reference,
      )

      expect(await prisma.registration.count({ where: { email } })).toBe(1)
    })

    it('answers a tripped honeypot like a success and stores nothing', async () => {
      const email = nsEmail('honeypot')
      const response = await api
        .request('post', '/api/v1/public/register')
        .send({ ...submission(email), hp_website: 'https://buy-cheap-placards.example' })

      expect(response.status).toBe(201)
      const body = response.body as PublicRegistrationAccepted
      expect(body.status).toBe('received')
      // A well-formed reference that matches nothing, so the bot cannot tell.
      expect(body.reference).toMatch(REFERENCE_PATTERN)
      expect(await prisma.registration.count({ where: { reference: body.reference } })).toBe(0)
      expect(await prisma.registration.count({ where: { email } })).toBe(0)
    })

    it('answers a non-string honeypot the same way, never with a 422 naming it', async () => {
      // A number or an object used to slip past the "is it a filled string"
      // check and fall through to validation, which replied 422 and named the
      // field — telling a script exactly which input to leave alone.
      const traps: unknown[] = [42, true, { toString: 'x' }, ['bot']]

      for (const [index, trap] of traps.entries()) {
        const email = nsEmail(`honeypot.type${index}`)
        const response = await api
          .request('post', '/api/v1/public/register')
          .send({ ...submission(email), hp_website: trap })

        expect(response.status).toBe(201)
        expect((response.body as PublicRegistrationAccepted).reference).toMatch(REFERENCE_PATTERN)
        expect(response.text).not.toContain('hp_website')
        expect(await prisma.registration.count({ where: { email } })).toBe(0)
      }
    })

    it('strips control characters from a name rather than failing on them', async () => {
      // Postgres rejects U+0000 in a text column outright, so a name pasted
      // from a mangled export used to surface to the applicant as a 500.
      const email = nsEmail('controlchars')
      const response = await api
        .request('post', '/api/v1/public/register')
        .send({ ...submission(email), fullName: `${NS.displayName}Sun\u0000ita Rana` })

      expect(response.status).toBe(201)

      const row = await prisma.registration.findFirstOrThrow({ where: { email } })
      expect(row.fullName).toBe(`${NS.displayName}Sunita Rana`)
      expect(row.fullName).not.toMatch(/[\u0000-\u001F]/)
    })

    it('rejects an oversized body with 413 and a malformed one with 400', async () => {
      const oversized = await api
        .request('post', '/api/v1/public/register')
        .set('Content-Type', 'application/json')
        // Past the 2mb parser limit. body-parser refuses this before any of
        // our code runs, and without a branch for it the caller's mistake came
        // back as our 500.
        .send(JSON.stringify({ ...submission(nsEmail('oversized')), dietaryNotes: 'x'.repeat(3_000_000) }))

      expect(oversized.status).toBe(413)
      expect((oversized.body as ApiErrorBody).code).toBe(413)
      expect((oversized.body as ApiErrorBody).details).toBeUndefined()
      expect(oversized.text).not.toMatch(/\bat .*\.(ts|js):\d+/)

      const malformed = await api
        .request('post', '/api/v1/public/register')
        .set('Content-Type', 'application/json')
        .send('{"fullName": "ZZ Broken Payload",')

      expect(malformed.status).toBe(400)
      expect((malformed.body as ApiErrorBody).code).toBe(400)
      expect((malformed.body as ApiErrorBody).details).toBeUndefined()
      expect(malformed.text).not.toMatch(/\bat .*\.(ts|js):\d+/)

      expect(await prisma.registration.count({ where: { email: nsEmail('oversized') } })).toBe(0)
    })

    it('stores the second preference, the experience figures and the screenshot', async () => {
      const email = nsEmail('twostep')

      const response = await api.request('post', '/api/v1/public/register').send(submission(email))
      expect(response.status).toBe(201)

      const row = await prisma.registration.findFirstOrThrow({ where: { email } })
      expect(row.committeePreference).toBe('DISEC')
      expect(row.committeePreference2).toBe('UNHRC')
      // Posted as strings by the form, stored as integers.
      expect(row.munsAttended).toBe(4)
      expect(row.awardsWon).toBe(1)
      expect(row.referralCode).toBe('RIDGE-MUNSOC')
      expect(row.paymentProofUrl).toBe(BLOB_URL)
      // Blank still means blank, not an empty string nobody can query for.
      expect(row.accessibilityNotes).toBeNull()
    })

    it('refuses a payment link that is not on the blob store', async () => {
      // The reviewer clicks this link from the review queue. Accepting an
      // arbitrary URL would let an unauthenticated stranger choose where the
      // one account that can approve registrations gets sent.
      const email = nsEmail('openredirect')

      const response = await api
        .request('post', '/api/v1/public/register')
        .send({ ...submission(email), paymentProofUrl: 'https://evil.example/x.png' })

      expect(response.status).toBe(422)
      expect(JSON.stringify((response.body as ApiErrorBody).details)).toContain('paymentProofUrl')
      expect(await prisma.registration.count({ where: { email } })).toBe(0)
    })

    it('refuses more awards than conferences attended, and names the field', async () => {
      const email = nsEmail('overclaimed')

      const response = await api
        .request('post', '/api/v1/public/register')
        .send({ ...submission(email), munsAttended: '1', awardsWon: '4' })

      expect(response.status).toBe(422)
      expect(JSON.stringify((response.body as ApiErrorBody).details)).toContain('awardsWon')
      expect(await prisma.registration.count({ where: { email } })).toBe(0)
    })

    it('names the field when a real field is wrong', async () => {
      // The counterpart to the honeypot's silence: a human who mistypes their
      // email is told which field to fix.
      const response = await api
        .request('post', '/api/v1/public/register')
        .send({ ...submission('not-an-email-address') })

      expect(response.status).toBe(422)
      const body = response.body as ApiErrorBody
      expect(body.code).toBe(422)
      expect(JSON.stringify(body.details)).toContain('email')
    })

    it('rate limits a flood from one address after five submissions', async () => {
      // Five per fifteen minutes per IP, which is the busiest legitimate
      // pattern — a teacher registering a delegation one student at a time.
      // Same email throughout, so the burst leaves one row rather than six.
      const email = nsEmail('flood')
      const from = '198.51.100.44'

      const statuses: number[] = []
      for (let attempt = 0; attempt < 6; attempt++) {
        const response = await api.request('post', '/api/v1/public/register', { from }).send(submission(email))
        statuses.push(response.status)
      }

      expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201])
      expect(statuses[5]).toBe(429)
      expect(await prisma.registration.count({ where: { email } })).toBe(1)
    }, 30_000)
  })

  /* ======================================================================== */
  /* 3b. The payment screenshot upload endpoint                               */
  /* ======================================================================== */

  /**
   * The screenshot goes browser → Vercel Blob directly, so this route only
   * hands out a token. It is unauthenticated and it grants write access to a
   * bucket, which makes what it refuses more interesting than what it allows.
   */
  describe('the blob upload endpoint', () => {
    it('is reachable without a token, like the rest of /public', async () => {
      const response = await api.request('post', '/api/v1/public/blob-upload').send({})
      // Whatever it answers, it never answers "who are you" — the whole point
      // is that a member of the public can reach it.
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    it.runIf(!blobConfigured)('says the service is unavailable rather than crashing', async () => {
      // No blob store locally, and that is a supported state. A 500 with a
      // stack would tell an applicant the site is broken when it is not.
      const response = await api.request('post', '/api/v1/public/blob-upload').send({
        type: 'blob.generate-presigned-url',
        payload: { pathname: 'payment-proof.png', multipart: false, clientPayload: null },
      })

      expect(response.status).toBe(503)
      const body = response.body as ApiErrorBody
      expect(body.code).toBe(503)
      expect(body.details).toBeUndefined()
      expect(response.text).not.toMatch(/\bat .*\.(ts|js):\d+/)
    })

    it.runIf(blobConfigured)('refuses an envelope that is not part of the upload protocol', async () => {
      const response = await api
        .request('post', '/api/v1/public/blob-upload')
        .send({ type: 'blob.please-just-give-me-a-token' })

      expect(response.status).toBe(400)
      expect((response.body as ApiErrorBody).code).toBe(400)
      expect(response.text).not.toMatch(/\bat .*\.(ts|js):\d+/)
    })

    it('rate limits a flood of token requests from one address', async () => {
      // Ten per quarter hour: one screenshot per application plus room to retry
      // a photo that came out unreadable. Beyond that it is free file hosting.
      const from = '198.51.100.63'

      const statuses: number[] = []
      for (let attempt = 0; attempt < 11; attempt++) {
        const response = await api.request('post', '/api/v1/public/blob-upload', { from }).send({
          type: 'blob.generate-client-token',
          payload: { pathname: 'payment-proof.png', callbackUrl: '', multipart: false, clientPayload: null },
        })
        statuses.push(response.status)
      }

      expect(statuses.slice(0, 10).every((status) => status !== 429)).toBe(true)
      expect(statuses[10]).toBe(429)
    }, 30_000)
  })

  /* ======================================================================== */
  /* 4. Review transitions                                                    */
  /* ======================================================================== */

  /**
   * Only PENDING is reviewable. A decision already taken is never re-taken
   * silently: approving twice would try to mint a second delegate, and
   * rejecting an approved application would strand a real Delegate row with no
   * application behind it.
   */
  describe('registration review transitions', () => {
    it('refuses a second approval', async () => {
      const registration = await pendingRegistration('twice')

      const first = await api.request('post', `/api/v1/registrations/${registration.id}/approve`, {
        token: adminToken,
      })
      expect(first.status).toBe(200)

      const delegatesAfterFirst = await prisma.delegate.count()

      const second = await api.request('post', `/api/v1/registrations/${registration.id}/approve`, {
        token: adminToken,
      })
      expect(second.status).toBe(409)
      expect((second.body as ApiErrorBody).error).toMatch(/already been approved/i)

      // The decisive part: no second Delegate for the same person.
      expect(await prisma.delegate.count()).toBe(delegatesAfterFirst)
    })

    it('refuses to reject an approved registration', async () => {
      const registration = await pendingRegistration('approvethenreject')

      const approve = await api.request('post', `/api/v1/registrations/${registration.id}/approve`, {
        token: adminToken,
      })
      expect(approve.status).toBe(200)

      const reject = await api
        .request('post', `/api/v1/registrations/${registration.id}/reject`, { token: adminToken })
        .send({ reason: 'Changed our mind' })

      expect(reject.status).toBe(409)
      // Load-bearing: it tells the operator what to do instead.
      expect((reject.body as ApiErrorBody).error).toMatch(/delete the delegate/i)

      const after = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })
      expect(after.status).toBe(RegistrationStatus.APPROVED)
      expect(await prisma.delegate.count({ where: { email: registration.email } })).toBe(1)
    })

    it('refuses to approve a rejected registration', async () => {
      const registration = await pendingRegistration('rejectthenapprove')

      const reject = await api
        .request('post', `/api/v1/registrations/${registration.id}/reject`, { token: adminToken })
        .send({ reason: 'Applications closed for this school' })
      expect(reject.status).toBe(200)

      const approve = await api.request('post', `/api/v1/registrations/${registration.id}/approve`, {
        token: adminToken,
      })
      expect(approve.status).toBe(409)
      expect((approve.body as ApiErrorBody).error).toMatch(/submit a new registration/i)

      expect(await prisma.delegate.count({ where: { email: registration.email } })).toBe(0)
      const after = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })
      expect(after.status).toBe(RegistrationStatus.REJECTED)
    })

    it('refuses a second rejection', async () => {
      const registration = await pendingRegistration('rejecttwice')

      const first = await api
        .request('post', `/api/v1/registrations/${registration.id}/reject`, { token: adminToken })
        .send({ reason: 'Duplicate of an earlier application' })
      expect(first.status).toBe(200)

      const second = await api
        .request('post', `/api/v1/registrations/${registration.id}/reject`, { token: adminToken })
        .send({ reason: 'Duplicate of an earlier application' })
      expect(second.status).toBe(409)
      expect((second.body as ApiErrorBody).error).toMatch(/already been rejected/i)
    })

    it('names the delegate standing in the way when the email is taken', async () => {
      // Delegate.email is unique, so this would fail at the constraint anyway.
      // Catching it in the route is what turns a generic conflict into a
      // sentence an operator can act on — and rules out ever overwriting
      // someone who is already on the delegate list.
      const email = nsEmail('aarav')
      const registration = await prisma.registration.create({
        data: {
          reference: generateReference(),
          fullName: `${NS.displayName}Aarav Shrestha`,
          email,
          phone: '+977 9812345678',
          schoolName: 'Ridge International School',
          grade: '11',
        },
        select: { id: true },
      })

      const delegatesBefore = await prisma.delegate.count()

      const response = await api.request('post', `/api/v1/registrations/${registration.id}/approve`, {
        token: adminToken,
      })

      expect(response.status).toBe(409)
      const body = response.body as ApiErrorBody
      expect(body.error).toContain(email)
      expect(body.error).toContain(`${NS.displayName}Aarav Shrestha`)
      expect(body.details).toMatchObject({ delegateId: fixtures.delegateId, email })

      expect(await prisma.delegate.count()).toBe(delegatesBefore)
      const after = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })
      expect(after.status).toBe(RegistrationStatus.PENDING)
    })
  })

  /* ======================================================================
     The country matrix
     ====================================================================== */
  describe('the country matrix', () => {
    /** Cleared between cases so each starts from "this committee has no matrix". */
    async function clearMatrix() {
      await prisma.committeeCountry.deleteMany({ where: { committeeId: fixtures.committeeId } })
    }

    async function addToMatrix(...countries: string[]) {
      for (const country of countries) {
        await prisma.committeeCountry.create({
          data: { committeeId: fixtures.committeeId, country },
        })
      }
    }

    /** Places the fixture delegate, returning the raw response. */
    function allocate(country: string) {
      return api
        .request('patch', `/api/v1/delegates/${fixtures.delegateId}`, { token: adminToken })
        .send({ committeeId: fixtures.committeeId, country })
    }

    async function unallocate() {
      await api
        .request('patch', `/api/v1/delegates/${fixtures.delegateId}`, { token: adminToken })
        .send({ committeeId: null })
    }

    it('leaves a committee with no matrix unconstrained', async () => {
      // This is what lets one committee's matrix be imported without freezing
      // the other five, so it is the case that matters most.
      await clearMatrix()
      const response = await allocate('Anywhere At All')
      expect(response.status).toBe(200)
      await unallocate()
    })

    it('refuses a country that is not on the matrix', async () => {
      await clearMatrix()
      await addToMatrix('France', 'China')

      const response = await allocate('Atlantis')
      expect(response.status).toBe(422)
      const body = response.body as ApiErrorBody
      expect(body.error).toContain('Atlantis')
      expect(body.error).toContain('matrix')

      // Refused, not partially applied.
      const delegate = await prisma.delegate.findUniqueOrThrow({
        where: { id: fixtures.delegateId },
        include: { assignment: true },
      })
      expect(delegate.assignment).toBeNull()
    })

    it('accepts a country that is on it', async () => {
      await clearMatrix()
      await addToMatrix('France', 'China')

      expect((await allocate('France')).status).toBe(200)
      const delegate = await prisma.delegate.findUniqueOrThrow({
        where: { id: fixtures.delegateId },
        include: { assignment: true },
      })
      expect(delegate.assignment?.country).toBe('France')
      await unallocate()
    })

    it('enforces it on the server, not only in the allocation screen', async () => {
      // The UI offers a pick-list, but a stale tab or a direct PATCH goes
      // through the same function — which is the point of checking here.
      await clearMatrix()
      await addToMatrix('France')

      const response = await api
        .request('patch', `/api/v1/delegates/${fixtures.delegateId}`, { token: adminToken })
        .send({ committeeId: fixtures.committeeId, country: 'france' })
      // Case matters: the matrix holds "France", and a delegate placed on
      // "france" would be a second row past the unique index.
      expect(response.status).toBe(422)
    })

    it('publishes the matrix on the committees payload', async () => {
      await clearMatrix()
      await addToMatrix('France', 'China')

      const response = await api.request('get', '/api/v1/committees', { token: contributorToken })
      expect(response.status).toBe(200)
      const items = (response.body as { items: Array<{ id: string; matrixCountries: string[] }> }).items
      const ours = items.find((c) => c.id === fixtures.committeeId)
      expect(ours?.matrixCountries).toEqual(['China', 'France'])
    })

    it('lets a contributor read it but not change it', async () => {
      await clearMatrix()
      expect((await api.request('get', '/api/v1/matrix', { token: contributorToken })).status).toBe(200)

      const write = await api
        .request('post', '/api/v1/matrix', { token: contributorToken })
        .send({ committeeId: fixtures.committeeId, country: 'France' })
      expect(write.status).toBe(403)

      const importing = await api
        .request('post', '/api/v1/matrix/import', { token: contributorToken })
        .send({ csv: 'ZZ,France' })
      expect(importing.status).toBe(403)
    })

    it('imports a wide sheet and reports a committee it cannot find', async () => {
      await clearMatrix()
      const committee = await prisma.committee.findUniqueOrThrow({
        where: { id: fixtures.committeeId },
        select: { code: true },
      })

      const response = await api
        .request('post', '/api/v1/matrix/import', { token: adminToken })
        .send({ csv: `${committee.code},NoSuchCommittee\nFrance,Atlantis\nChina,\n`, mode: 'merge' })

      expect(response.status).toBe(200)
      const body = response.body as {
        added: number
        committees: string[]
        issues: Array<{ reason: string }>
      }
      expect(body.added).toBe(2)
      expect(body.committees).toEqual([committee.code])
      // Never invents a committee — it cannot know the seat count.
      expect(body.issues.some((i) => i.reason.includes('NoSuchCommittee'))).toBe(true)
      expect(await prisma.committee.count({ where: { code: 'NoSuchCommittee' } })).toBe(0)
    })

    it('will not remove a country a delegate is sitting on', async () => {
      await clearMatrix()
      await addToMatrix('France', 'China')
      expect((await allocate('France')).status).toBe(200)

      const committee = await prisma.committee.findUniqueOrThrow({
        where: { id: fixtures.committeeId },
        select: { code: true },
      })

      // `replace` with a sheet that drops France. It has to stay: removing it
      // would strand the delegate on a country the committee no longer has.
      const response = await api
        .request('post', '/api/v1/matrix/import', { token: adminToken })
        .send({ csv: `${committee.code}\nChina\n`, mode: 'replace' })

      expect(response.status).toBe(200)
      const body = response.body as { kept: Array<{ country: string }>; removed: number }
      expect(body.kept.map((k) => k.country)).toEqual(['France'])
      expect(body.removed).toBe(0)

      const remaining = await prisma.committeeCountry.findMany({
        where: { committeeId: fixtures.committeeId },
        select: { country: true },
      })
      expect(remaining.map((r) => r.country).sort()).toEqual(['China', 'France'])

      await unallocate()
      await clearMatrix()
    })
  })

})
