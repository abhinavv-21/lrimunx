import { describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { Role } from '@prisma/client'
import { requireAdmin, requireRole } from './rbac.js'
import { ApiError } from '../lib/errors.js'

function reqAs(role: Role | null): Request {
  return (role
    ? { user: { id: 'u1', username: 'u', fullName: 'U', role } }
    : {}) as unknown as Request
}

const res = {} as Response

function runGate(gate: ReturnType<typeof requireRole>, role: Role | null) {
  const next = vi.fn() as unknown as NextFunction
  gate(reqAs(role), res, next)
  return next as unknown as ReturnType<typeof vi.fn>
}

describe('requireRole', () => {
  it('rejects an unauthenticated request with 401', () => {
    const next = runGate(requireAdmin, null)
    const error = next.mock.calls[0]?.[0] as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(401)
  })

  it('rejects a CONTRIBUTOR on an admin-only gate with 403', () => {
    const next = runGate(requireAdmin, Role.CONTRIBUTOR)
    const error = next.mock.calls[0]?.[0] as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(403)
  })

  it('admits an ADMIN on an admin-only gate', () => {
    const next = runGate(requireAdmin, Role.ADMIN)
    expect(next).toHaveBeenCalledWith()
  })

  it('admits either role when both are allowed', () => {
    for (const role of [Role.ADMIN, Role.CONTRIBUTOR]) {
      const next = runGate(requireRole(Role.ADMIN, Role.CONTRIBUTOR), role)
      expect(next).toHaveBeenCalledWith()
    }
  })

  it('does not let a CONTRIBUTOR through a gate that lists only ADMIN, even repeatedly', () => {
    for (let i = 0; i < 3; i++) {
      const next = runGate(requireRole(Role.ADMIN), Role.CONTRIBUTOR)
      const error = next.mock.calls[0]?.[0] as ApiError
      expect(error.code).toBe(403)
    }
  })
})
