import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { Role } from '@prisma/client'
import { ApiError } from '../lib/errors.js'

// Ownership is a row, so the gate has to read one. Stubbing the client keeps
// this a test of the rule rather than of PostgreSQL — the integration suite
// covers the wiring.
const findUnique = vi.fn()
vi.mock('../lib/prisma.js', () => ({ prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } } }))

const { requireOwner } = await import('./rbac.js')

const res = {} as Response

function reqAs(role: Role | null): Request {
  return (role ? { user: { id: 'u1', username: 'abhinav', fullName: 'Abhinav', role } } : {}) as unknown as Request
}

async function runGate(role: Role | null): Promise<ReturnType<typeof vi.fn>> {
  const next = vi.fn()
  requireOwner(reqAs(role), res, next as unknown as NextFunction)
  // The gate answers on a promise chain; let it settle before reading `next`.
  await new Promise((resolve) => setImmediate(resolve))
  return next
}

beforeEach(() => {
  findUnique.mockReset()
})

describe('requireOwner', () => {
  it('rejects an unauthenticated request with 401 and never touches the database', async () => {
    const next = await runGate(null)

    const error = next.mock.calls[0]?.[0] as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(401)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('admits the account that holds the flag', async () => {
    findUnique.mockResolvedValue({ isOwner: true })

    const next = await runGate(Role.ADMIN)
    expect(next).toHaveBeenCalledWith()
  })

  it('refuses an ADMIN who does not hold it — being an admin is not owning the hub', async () => {
    findUnique.mockResolvedValue({ isOwner: false })

    const next = await runGate(Role.ADMIN)
    const error = next.mock.calls[0]?.[0] as ApiError
    expect(error.code).toBe(403)
    expect(error.message).toMatch(/owner/i)
  })

  it('refuses a CONTRIBUTOR who somehow holds the flag is still read from the row', async () => {
    // The gate deliberately does not check role at all: ownership is its own
    // axis. A CONTRIBUTOR with the flag gets in, which is the intended
    // behaviour and the reason it is not spelled `requireAdmin + isOwner`.
    findUnique.mockResolvedValue({ isOwner: true })

    const next = await runGate(Role.CONTRIBUTOR)
    expect(next).toHaveBeenCalledWith()
  })

  it('refuses when the account has been deleted out from under the token', async () => {
    findUnique.mockResolvedValue(null)

    const next = await runGate(Role.ADMIN)
    expect((next.mock.calls[0]?.[0] as ApiError).code).toBe(403)
  })

  it('reads the flag from the database on every call, not from the token', async () => {
    findUnique.mockResolvedValue({ isOwner: true })
    await runGate(Role.ADMIN)

    // Revoked between requests. The second call must refuse immediately rather
    // than waiting for the access token to expire.
    findUnique.mockResolvedValue({ isOwner: false })
    const next = await runGate(Role.ADMIN)

    expect(findUnique).toHaveBeenCalledTimes(2)
    expect((next.mock.calls[0]?.[0] as ApiError).code).toBe(403)
  })

  it('selects only the flag, so the gate cannot leak a password hash into memory', async () => {
    findUnique.mockResolvedValue({ isOwner: true })
    await runGate(Role.ADMIN)

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: { isOwner: true } })
  })

  it('passes a database failure to the error handler rather than admitting the request', async () => {
    findUnique.mockRejectedValue(new Error('connection terminated'))

    const next = await runGate(Role.ADMIN)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error)
    expect(next).not.toHaveBeenCalledWith()
  })
})
