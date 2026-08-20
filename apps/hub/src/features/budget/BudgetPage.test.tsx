import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BudgetPage } from './BudgetPage'
import type { LedgerPage, LedgerSummary } from '@/types/api'

const summaryQuery = vi.fn()
const ledgerQuery = vi.fn()

vi.mock('@/lib/hooks', () => ({
  useDebounced: (value: unknown) => value,
  useLedgerSummary: () => summaryQuery(),
  useLedger: () => ledgerQuery(),
  useSaveLedgerEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLedgerEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}))

const SUMMARY: LedgerSummary = {
  registrations: {
    tiers: [
      { tier: 'BASE', count: 9, total: 22000, configuredPrice: 2500, expected: 22500 },
      { tier: 'INTERNAL', count: 2, total: 2400, configuredPrice: 1200, expected: 2400 },
      { tier: 'ALUMNI', count: 3, total: 6000, configuredPrice: 2000, expected: 6000 },
      { tier: 'DISCOUNT', count: 0, total: 0, configuredPrice: 1500, expected: 0 },
    ],
    unrecorded: 0,
    count: 14,
    collected: 30400,
    expected: 30900,
    shortfall: 500,
  },
  ledger: {
    byCategory: [{ category: 'VENUE', credit: 0, debit: 45000 }],
    credit: 0,
    debit: 45000,
  },
  net: { income: 30400, expense: 45000, balance: -14600 },
}

const EMPTY_LEDGER: LedgerPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
  totals: { credit: 0, debit: 0 },
}

function show(summary: Partial<Record<string, unknown>>, ledger: Partial<Record<string, unknown>>) {
  summaryQuery.mockReturnValue({ isPending: false, isError: false, refetch: vi.fn(), ...summary })
  ledgerQuery.mockReturnValue({
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    data: EMPTY_LEDGER,
    ...ledger,
  })

  return render(
    <MemoryRouter>
      <BudgetPage />
    </MemoryRouter>,
  )
}

describe('the summary', () => {
  it('shows every figure as money, with the currency and separators', () => {
    show({ data: SUMMARY }, {})

    // Money in reads the same in the headline stat and in the tier footer.
    expect(screen.getAllByText('Rs 30,400').length).toBeGreaterThan(1)
    expect(screen.getByText('Rs 45,000', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getAllByText('−Rs 14,600').length).toBeGreaterThan(0)
  })

  it('says plainly when spending has passed what came in', () => {
    show({ data: SUMMARY }, {})

    expect(screen.getByRole('alert')).toHaveTextContent(/Spending has passed what has come in/)
  })

  it('keeps a tier nobody is on, showing zero rather than leaving a gap', () => {
    show({ data: SUMMARY }, {})

    // DISCOUNT: nobody on it, so the rate still shows and the collected figure is a real zero.
    expect(screen.getAllByText('Rs 1,500').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rs 0').length).toBeGreaterThan(0)
  })

  it('names the registrations that carry money but no tier', () => {
    show(
      { data: { ...SUMMARY, registrations: { ...SUMMARY.registrations, unrecorded: 3 } } },
      {},
    )

    expect(screen.getByText(/3 registrations have money against them but no tier/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Set their tier in Registrations/ })).toBeInTheDocument()
  })

  it('tells the treasurer nothing has been collected rather than showing an empty table', () => {
    show(
      {
        data: {
          ...SUMMARY,
          registrations: { ...SUMMARY.registrations, count: 0, collected: 0, expected: 0, shortfall: 0 },
        },
      },
      {},
    )

    expect(screen.getByText(/No payment has been recorded against a registration yet/)).toBeInTheDocument()
  })

  it('offers a retry when the summary fails, and does not print a figure', () => {
    show({ isError: true, error: new Error('Connection refused'), data: undefined }, {})

    expect(screen.getByText('Connection refused')).toBeInTheDocument()
    expect(screen.queryByText(/^Rs /)).not.toBeInTheDocument()
  })
})

describe('the ledger', () => {
  it('asks for a first entry when there is nothing and no filter', () => {
    show({ data: SUMMARY }, {})

    expect(screen.getByText('The ledger is empty')).toBeInTheDocument()
  })

  it('totals the whole filter, and says that is what it is doing', () => {
    show(
      { data: SUMMARY },
      {
        data: {
          ...EMPTY_LEDGER,
          total: 128,
          items: [
            {
              id: 'entry-1',
              entryDate: '2026-08-14T00:00:00.000Z',
              particular: 'Hall booking, day one',
              category: 'VENUE',
              credit: 0,
              debit: 45000,
              note: 'Invoice 2211',
              createdAt: '2026-08-14T00:00:00.000Z',
              updatedAt: '2026-08-14T00:00:00.000Z',
              recordedBy: { id: 'u-1', fullName: 'Secretariat Desk' },
            },
          ],
          totals: { credit: 250000, debit: 118000 },
        },
      },
    )

    expect(screen.getByText(/Across all 128 entries, not just this page/)).toBeInTheDocument()
    expect(screen.getByText('Rs 2,50,000')).toBeInTheDocument()
    expect(screen.getByText('Rs 1,18,000')).toBeInTheDocument()
    // 250000 − 118000, netted for the filter rather than for the page.
    expect(screen.getByText('Rs 1,32,000')).toBeInTheDocument()
  })
})
