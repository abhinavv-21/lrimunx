import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllocationRow } from './AllocationRow'
import type { Committee, Delegate } from '@/types/api'

const mutateAsync = vi.fn()
vi.mock('@/lib/hooks', () => ({
  useUpdateDelegate: () => ({ mutateAsync, isPending: false }),
}))

const delegate: Delegate = {
  id: 'del-1',
  fullName: 'Aarav Menon',
  email: 'aarav@example.org',
  phone: '+977 9800000000',
  schoolName: 'Ridge International School',
  grade: '11',
  committeePreference: 'DISEC',
  committeePreference2: null,
  munsAttended: 2,
  awardsWon: 1,
  dietaryNotes: null,
  accessibilityNotes: null,
  attendanceStatus: 'ABSENT',
  assignment: null,
  // Hand-added delegates have no registration behind them.
  registration: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const withMatrix: Committee = {
  id: 'unsc',
  name: 'United Nations Security Council',
  code: 'UNSC',
  totalSeats: 15,
  filledSeats: 1,
  seatsRemaining: 14,
  matrixCountries: ['Brazil', 'China', 'France', "Côte d'Ivoire"],
  takenCountries: [{ country: 'France', delegateId: 'del-2', delegateName: 'Prakriti Rana' }],
}

const withoutMatrix: Committee = {
  id: 'disec',
  name: 'Disarmament and International Security',
  code: 'DISEC',
  totalSeats: 30,
  filledSeats: 0,
  seatsRemaining: 30,
  matrixCountries: [],
  takenCountries: [],
}

beforeEach(() => {
  mutateAsync.mockReset()
  mutateAsync.mockResolvedValue(undefined)
})

const country = () => screen.getByRole('combobox', { name: /Country for Aarav Menon/ })
const committee = () => screen.getByRole('combobox', { name: /Committee for Aarav Menon/ })

describe('a committee that has a country matrix', () => {
  it('offers the matrix as a filterable list and saves the choice', async () => {
    const user = userEvent.setup()
    render(<AllocationRow delegate={delegate} committees={[withMatrix, withoutMatrix]} />)

    await user.click(committee())
    await user.click(screen.getByRole('option', { name: /UNSC/ }))

    await user.click(country())
    await user.keyboard('cote')
    await user.click(screen.getByRole('option', { name: /Côte d'Ivoire/ }))

    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'del-1',
      committeeId: 'unsc',
      country: "Côte d'Ivoire",
    })
  })

  it('shows a taken country as unavailable and names who holds it', async () => {
    const user = userEvent.setup()
    render(<AllocationRow delegate={delegate} committees={[withMatrix]} />)

    await user.click(committee())
    await user.click(screen.getByRole('option', { name: /UNSC/ }))
    await user.click(country())

    const france = screen.getByRole('option', { name: /France/ })
    expect(france).toHaveAttribute('aria-disabled', 'true')

    expect(france).toHaveTextContent('Prakriti Rana')

    await user.click(france)
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('refuses a country that is not on the matrix, and says so', async () => {
    const user = userEvent.setup()
    render(<AllocationRow delegate={delegate} committees={[withMatrix]} />)

    await user.click(committee())
    await user.click(screen.getByRole('option', { name: /UNSC/ }))
    await user.click(country())
    await user.keyboard('Atlantis')

    expect(within(screen.getByRole('listbox')).getByText(/Not on UNSC/)).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
})

describe('a committee with no matrix', () => {
  it('accepts a typed country, because an empty matrix means unconstrained', async () => {
    const user = userEvent.setup()
    render(<AllocationRow delegate={delegate} committees={[withoutMatrix]} />)

    await user.click(committee())
    await user.click(screen.getByRole('option', { name: /DISEC/ }))
    await user.click(country())
    await user.keyboard('Nepal')
    await user.click(screen.getByRole('option', { name: /Use "Nepal"/ }))

    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'del-1',
      committeeId: 'disec',
      country: 'Nepal',
    })
  })
})

describe('picking a committee', () => {
  it('does not save until there is a country, and moves focus there', async () => {
    const user = userEvent.setup()
    render(<AllocationRow delegate={delegate} committees={[withMatrix]} />)

    await user.click(committee())
    await user.click(screen.getByRole('option', { name: /UNSC/ }))

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(country())
  })

  it('never commits while arrowing through the committee list', async () => {
    const user = userEvent.setup()
    render(
      <AllocationRow
        delegate={{
          ...delegate,
          assignment: {
            id: 'asg-1',
            committee: { id: 'unsc', name: withMatrix.name, code: 'UNSC' },
            country: 'Brazil',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        }}
        committees={[withMatrix, withoutMatrix]}
      />,
    )

    committee().focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}')

    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
