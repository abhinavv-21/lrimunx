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

const SYNTHETIC_UUID = '00000000-0000-4000-8000-000000000000'

const PUSH_ENDPOINT = `${NS.pushEndpoint}contributor-device`

const BLOB_URL =
  process.env['S3_ENDPOINT'] && process.env['S3_BUCKET']
    ? `${process.env['S3_ENDPOINT'].replace(/\/+$/, '')}/${process.env['S3_BUCKET']}/payment-proofs/9Kq2LmR4.png`
    : null

const blobConfigured = Boolean(
  process.env['S3_ENDPOINT'] && process.env['S3_BUCKET'],
)

function submission(email: string): Record<string, unknown> {
  return {
    fullName: `${NS.displayName}Prakriti Basnet`,
    email,
    phone: '+977 9812345678',
    schoolName: 'Ridge International School',
    grade: '11',
    committeePreference: 'DISEC',
    committeePreference2: 'UNHRC',
    munsAttended: '4',
    awardsWon: '1',
    referralCode: 'RIDGE-MUNSOC',
    ...(BLOB_URL ? { paymentProofUrl: BLOB_URL } : {}),
    dietaryNotes: 'Vegetarian meals only',
    accessibilityNotes: '',
  }
}

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
      ...(BLOB_URL ? { paymentProofUrl: BLOB_URL } : {}),
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

      expect(await countAllTables(prisma)).toEqual(baseline)
    } finally {
      await prisma.$disconnect()
    }
  }, 30_000)

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

      expect(rows[0]?.submittedIp).toBe('198.51.100.7')

      expect(await prisma.user.count()).toBe(usersBefore)
    })

    it('ignores every privileged field a submitter tries to set', async () => {
      const email = nsEmail('massassign')
      const usersBefore = await prisma.user.count()
      const injectedUsername = `${NS.username}injected_admin`

      const response = await api.request('post', '/api/v1/public/register').send({
        ...submission(email),
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

      const body = response.body as { email?: { sent: boolean; skipped: boolean } }
      expect(body.email).toBeDefined()
      expect(body.email).toEqual({ sent: false, skipped: true })

      const delegate = await prisma.delegate.findUniqueOrThrow({
        where: { email: registration.email },
        include: { assignment: true },
      })

      expect(delegate.assignment).toBeNull()
      expect(delegate.committeePreference).toBe('UNHRC')
      expect(await prisma.assignment.count()).toBe(assignmentsBefore)
      expect(await prisma.user.count()).toBe(usersBefore)

      expect(delegate.committeePreference2).toBe('DISEC')
      expect(delegate.munsAttended).toBe(6)
      expect(delegate.awardsWon).toBe(2)

      const after = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })
      expect(after.status).toBe(RegistrationStatus.APPROVED)
      expect(after.delegateId).toBe(delegate.id)
      expect(after.reviewedById).toBe(fixtures.adminId)

      expect(after.referralCode).toBe('RIDGE-MUNSOC')
      expect(after.paymentProofUrl).toBe(BLOB_URL ?? null)

      const trail = await prisma.auditLog.findMany({ where: { userId: fixtures.adminId } })
      expect(trail.some((row) => row.action === 'APPROVE' && row.entityId === registration.id)).toBe(true)
      expect(trail.some((row) => row.action === 'CREATE' && row.entityId === delegate.id)).toBe(true)
    })
  })

  interface RouteCase {
    method: HttpMethod
    url: string
    body?: Record<string, unknown>

    contributor: number
  }

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
      { method: 'delete', url: '/api/v1/audit-logs', contributor: 403 },
      { method: 'get', url: `/api/v1/audit-logs/entity/Delegate/${f.delegateId}`, contributor: 403 },
      { method: 'get', url: '/api/v1/exports?dataset=delegates&format=xlsx', contributor: 403 },
      { method: 'put', url: '/api/v1/settings', body: { googleFormUrl: '' }, contributor: 403 },
      { method: 'post', url: '/api/v1/integrations/csv', body: { csv: 'fullName\n' }, contributor: 403 },
    ]
  }

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

      expect(routes.length).toBeGreaterThanOrEqual(39)

      const leaked: string[] = []
      for (const route of routes) {
        const response = await api.request(route.method, route.url).send(route.body ?? {})
        if (response.status !== 401) leaked.push(`${route.method.toUpperCase()} ${route.url} → ${response.status}`)
      }

      expect(leaked).toEqual([])
    }, 60_000)

    it('rejects a token this API did not sign', async () => {
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

      const trail = await prisma.auditLog.findMany({
        where: { userId: fixtures.contributorId, action: 'CHECK_IN', entityId: fixtures.delegateId },
      })
      expect(trail).toHaveLength(1)

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

  describe('managing accounts is narrower than ADMIN', () => {
    const asAdmin = (method: HttpMethod, url: string) =>
      api.request(method, url, { token: adminToken })

    it('refuses an ADMIN who does not have the flag', async () => {
      for (const [method, url] of [
        ['get', '/api/v1/users'],
        ['post', '/api/v1/users'],
        ['patch', `/api/v1/users/${fixtures.contributorId}`],
        ['delete', `/api/v1/users/${fixtures.contributorId}`],
      ] as Array<[HttpMethod, string]>) {
        const response = await asAdmin(method, url).send({})
        expect(response.status).toBe(403)
        expect((response.body as ApiErrorBody).error).toContain('restricted')
      }
    })

    it('lets the same admin through once the flag is granted, and shuts again when it is taken away', async () => {
      await prisma.user.update({
        where: { id: fixtures.adminId },
        data: { canManageUsers: true },
      })
      expect((await asAdmin('get', '/api/v1/users')).status).toBe(200)

      await prisma.user.update({
        where: { id: fixtures.adminId },
        data: { canManageUsers: false },
      })

      expect((await asAdmin('get', '/api/v1/users')).status).toBe(403)
    })

    it('will not let the last holder give it up', async () => {
      await prisma.user.update({
        where: { id: fixtures.adminId },
        data: { canManageUsers: true },
      })
      const others = await prisma.user.count({
        where: { canManageUsers: true, id: { not: fixtures.adminId } },
      })

      const response = await asAdmin('patch', `/api/v1/users/${fixtures.adminId}`)
        .send({ canManageUsers: false })

      if (others === 0) {
        expect(response.status).toBe(409)
        expect((response.body as ApiErrorBody).error).toContain('at least one account')
      } else {
        expect(response.status).toBe(200)
      }

      await prisma.user.update({
        where: { id: fixtures.adminId },
        data: { canManageUsers: false },
      })
    })

    it('tells the client, so the hub can hide the tab', async () => {
      const me = await asAdmin('get', '/api/v1/auth/me').send()
      expect(me.status).toBe(200)
      expect(me.body).toHaveProperty('canManageUsers', false)
    })
  })

  describe('signing out actually ends the session', () => {
    async function signIn(username: string) {
      const response = await api.request('post', '/api/v1/auth/login')
        .send({ username, password: fixtures.password })
      expect(response.status).toBe(200)
      return response.body as { accessToken: string; refreshToken: string }
    }

    const refreshWith = (refreshToken: string) =>
      api.request('post', '/api/v1/auth/refresh').send({ refreshToken })

    const signOut = (accessToken: string, refreshToken?: string) =>
      api.request('post', '/api/v1/auth/logout', { token: accessToken })
        .send(refreshToken === undefined ? {} : { refreshToken })

    it('refuses a refresh token once that session has been signed out', async () => {
      const session = await signIn(fixtures.contributorUsername)

      const before = await refreshWith(session.refreshToken)
      expect(before.status).toBe(200)
      const live = (before.body as { refreshToken: string }).refreshToken

      expect((await signOut(session.accessToken, live)).status).toBe(204)

      const after = await refreshWith(live)
      expect(after.status).toBe(401)
    })

    it('spends the presented token, so a copy of it stops working', async () => {
      const session = await signIn(fixtures.contributorUsername)

      const first = await refreshWith(session.refreshToken)
      expect(first.status).toBe(200)
      const rotated = (first.body as { accessToken: string; refreshToken: string })

      expect((await refreshWith(session.refreshToken)).status).toBe(401)

      await signOut(rotated.accessToken, rotated.refreshToken)
    })

    it('signs out every session when it is not told which one', async () => {
      const desk = await signIn(fixtures.contributorUsername)
      const phone = await signIn(fixtures.contributorUsername)

      expect((await signOut(desk.accessToken)).status).toBe(204)

      for (const session of [desk, phone]) {
        expect((await refreshWith(session.refreshToken)).status).toBe(401)
      }
    })

    it('stores a hash, never the token', async () => {
      const session = await signIn(fixtures.contributorUsername)

      const rows = await prisma.session.findMany({ where: { userId: fixtures.contributorId } })
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.some((row) => row.tokenHash === session.refreshToken)).toBe(false)
      expect(rows.every((row) => /^[0-9a-f]{64}$/.test(row.tokenHash))).toBe(true)

      await signOut(session.accessToken)
    })

    it('issues distinct tokens for two sign-ins in the same second', async () => {
      const [a, b] = await Promise.all([
        signIn(fixtures.contributorUsername),
        signIn(fixtures.contributorUsername),
      ])
      expect(a.refreshToken).not.toBe(b.refreshToken)

      await signOut(a.accessToken)
    })
  })

  describe('the public registration endpoint', () => {
    it('answers a duplicate exactly as it answers a first submission', async () => {
      const email = nsEmail('duplicate')
      const from = '198.51.100.21'

      const first = await api.request('post', '/api/v1/public/register', { from }).send(submission(email))
      const second = await api.request('post', '/api/v1/public/register', { from }).send(submission(email))

      expect(second.status).toBe(first.status)
      expect(second.status).toBe(201)
      expect(Object.keys(second.body as object).sort()).toEqual(Object.keys(first.body as object).sort())
      expect((second.body as PublicRegistrationAccepted).status).toBe('received')
      expect(second.text).not.toMatch(/duplicate/i)

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

      expect(body.reference).toMatch(REFERENCE_PATTERN)
      expect(await prisma.registration.count({ where: { reference: body.reference } })).toBe(0)
      expect(await prisma.registration.count({ where: { email } })).toBe(0)
    })

    it('answers a non-string honeypot the same way, never with a 422 naming it', async () => {
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
      const email = nsEmail('controlchars')
      const response = await api
        .request('post', '/api/v1/public/register')
        .send({ ...submission(email), fullName: `${NS.displayName}Sun\u0000ita Rana` })

      expect(response.status).toBe(201)

      const row = await prisma.registration.findFirstOrThrow({ where: { email } })
      expect(row.fullName).toBe(`${NS.displayName}Sunita Rana`)
      // eslint-disable-next-line no-control-regex -- asserting the sanitiser stripped them.
      expect(row.fullName).not.toMatch(/[\u0000-\u001F]/)
    })

    it('rejects an oversized body with 413 and a malformed one with 400', async () => {
      const oversized = await api
        .request('post', '/api/v1/public/register')
        .set('Content-Type', 'application/json')
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

      expect(row.munsAttended).toBe(4)
      expect(row.awardsWon).toBe(1)
      expect(row.referralCode).toBe('RIDGE-MUNSOC')
      expect(row.paymentProofUrl).toBe(BLOB_URL ?? null)

      expect(row.accessibilityNotes).toBeNull()
    })

    it('refuses a payment link that is not on the blob store', async () => {
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
      const response = await api
        .request('post', '/api/v1/public/register')
        .send({ ...submission('not-an-email-address') })

      expect(response.status).toBe(422)
      const body = response.body as ApiErrorBody
      expect(body.code).toBe(422)
      expect(JSON.stringify(body.details)).toContain('email')
    })

    it('rate limits a flood from one address after five submissions', async () => {
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

  describe('the blob upload endpoint', () => {
    it('is reachable without a token, like the rest of /public', async () => {
      const response = await api.request('post', '/api/v1/public/blob-upload').send({})

      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    it.runIf(!blobConfigured)('says the service is unavailable rather than crashing', async () => {
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

  describe('the country matrix', () => {
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
      await clearMatrix()
      await addToMatrix('France')

      const response = await api
        .request('patch', `/api/v1/delegates/${fixtures.delegateId}`, { token: adminToken })
        .send({ committeeId: fixtures.committeeId, country: 'france' })

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
