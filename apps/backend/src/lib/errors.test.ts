import { describe, expect, it } from 'vitest'
import { ApiError } from './errors.js'

describe('ApiError', () => {
  it('serialises to the documented shape without a details key when absent', () => {
    const body = ApiError.notFound('Delegate not found').toBody()
    expect(body).toEqual({ error: 'Delegate not found', code: 404 })
    expect('details' in body).toBe(false)
  })

  it('includes details when provided', () => {
    const body = ApiError.conflict('UNSC is full', { filledSeats: 15, totalSeats: 15 }).toBody()
    expect(body).toEqual({
      error: 'UNSC is full',
      code: 409,
      details: { filledSeats: 15, totalSeats: 15 },
    })
  })

  it('maps each factory to the right status code', () => {
    expect(ApiError.badRequest().code).toBe(400)
    expect(ApiError.unauthorized().code).toBe(401)
    expect(ApiError.forbidden().code).toBe(403)
    expect(ApiError.notFound().code).toBe(404)
    expect(ApiError.conflict('x').code).toBe(409)
    expect(ApiError.unprocessable('x').code).toBe(422)
    expect(ApiError.internal().code).toBe(500)
  })

  it('never leaks an internal message by default', () => {
    expect(ApiError.internal().message).toBe('Something went wrong')
  })
})
