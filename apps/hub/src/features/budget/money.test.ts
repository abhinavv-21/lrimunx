import { describe, expect, it } from 'vitest'
import { NO_FIGURE, formatMoney } from './money'

describe('formatMoney', () => {
  it('groups in lakhs, the way a Nepali bank slip reads', () => {
    expect(formatMoney(2500)).toBe('Rs 2,500')
    expect(formatMoney(250000)).toBe('Rs 2,50,000')
    expect(formatMoney(12500000)).toBe('Rs 1,25,00,000')
  })

  it('renders a real zero as a zero, not as a dash', () => {
    expect(formatMoney(0)).toBe('Rs 0')
  })

  it('renders a missing figure as a dash, so it cannot be read as zero', () => {
    expect(formatMoney(null)).toBe(NO_FIGURE)
    expect(formatMoney(undefined)).toBe(NO_FIGURE)
  })

  it('never puts NaN or Infinity on the screen', () => {
    expect(formatMoney(Number.NaN)).toBe(NO_FIGURE)
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe(NO_FIGURE)
    expect(formatMoney(Number.NEGATIVE_INFINITY)).toBe(NO_FIGURE)
  })

  it('signs an overspend with a minus that lines up with the digits', () => {
    expect(formatMoney(-4200)).toBe('−Rs 4,200')
  })

  it('shows no decimals, because no rupee figure in this system has any', () => {
    expect(formatMoney(1499.6)).toBe('Rs 1,500')
    expect(formatMoney(1499.2)).toBe('Rs 1,499')
  })
})
