import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DaySwitcher } from './DaySwitcher'
import { defaultDay } from './conference'
import type { ConferenceMode } from '@/types/api'

const DAYS = [
  { day: 1, date: '2026-11-21' },
  { day: 2, date: '2026-11-22' },
  { day: 3, date: '2026-11-23' },
]

const tab = (day: number) => screen.getByRole('button', { name: new RegExp(`Day ${day}`) })

describe('switching between the three days', () => {
  it('marks the day being viewed and leaves the other two alone', () => {
    render(<DaySwitcher days={DAYS} value={2} onChange={vi.fn()} />)

    expect(tab(2)).toHaveAttribute('aria-pressed', 'true')
    expect(tab(1)).toHaveAttribute('aria-pressed', 'false')
    expect(tab(3)).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the day that was pressed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DaySwitcher days={DAYS} value={1} onChange={onChange} />)

    await user.click(tab(3))

    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('shows each day its own date and count, so day 2 can be compared to day 1', () => {
    render(
      <DaySwitcher
        days={[
          { day: 1, date: '2026-11-21', count: 58, of: 60 },
          { day: 2, date: '2026-11-22', count: 41, of: 60 },
          { day: 3, date: '2026-11-23', count: 0, of: 60 },
        ]}
        value={1}
        onChange={vi.fn()}
      />,
    )

    expect(tab(1)).toHaveTextContent('21 Nov')
    expect(tab(1)).toHaveTextContent('58')
    expect(tab(2)).toHaveTextContent('22 Nov')
    expect(tab(2)).toHaveTextContent('41')
    expect(tab(3)).toHaveTextContent('0')
  })

  it('names which day the conference itself is on, even when another is being viewed', () => {
    render(<DaySwitcher days={DAYS} value={1} onChange={vi.fn()} activeDay={2} />)

    expect(tab(2)).toHaveTextContent('(today)')
    expect(tab(1)).not.toHaveTextContent('(today)')
  })
})

describe('which day a screen opens on', () => {
  const mode = (state: ConferenceMode['state'], activeDay: number): ConferenceMode => ({
    state,
    activeDay,
    days: DAYS,
  })

  it('follows the conference once it is running', () => {
    expect(defaultDay(mode('RUNNING', 3))).toBe(3)
  })

  it('falls back to day 1 before it starts, so a rehearsal check-in lands somewhere', () => {
    expect(defaultDay(mode('PREPARING', 2))).toBe(1)
  })

  it('stays on the day the conference finished on once it has ended', () => {
    expect(defaultDay(mode('ENDED', 3))).toBe(3)
  })

  it('falls back to day 1 while the conference state is still loading', () => {
    expect(defaultDay(undefined)).toBe(1)
  })
})
