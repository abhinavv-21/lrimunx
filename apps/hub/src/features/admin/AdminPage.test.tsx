import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/providers/ToastProvider'
import { AdminPage } from './AdminPage'

const RESPONSES: Record<string, unknown> = {
  '/settings': {
    googleFormUrl: '',
    googleSheetUrl: '',
    conferenceName: 'LRI Model United Nations',
    edition: 'X',
    startsOn: '2026-11-20',
    endsOn: '2026-11-22',
    venue: 'Lucknow Regional Institute',
    contactEmail: 'secretariat@lrimun.org',
  },
  '/settings/pricing': { BASE: 2500, INTERNAL: 1200, ALUMNI: 2000, DISCOUNT: 1500 },
  '/allocations/announce/preview?includeStudyGuide=true': {
    willSend: 12,
    batchSize: 25,
    batchesNeeded: 1,
    emailConfigured: false,
    requireStudyGuide: true,
    committeesMissingGuide: [],
    conference: { startsOn: '2026-11-20', endsOn: '2026-11-22', venue: 'LRI' },
    confirmationPhrase: 'lrimunx',
    recipients: [],
    excluded: [],
    excludedCounts: { NO_ALLOCATION: 3, NO_EMAIL: 0, ALREADY_SENT: 4, NO_STUDY_GUIDE: 0 },
  },
  '/audit-logs?page=1&pageSize=50': { items: [], total: 0, page: 1, pageSize: 50 },
  '/danger/reset/preview': {
    deleted: {
      awards: 0,
      assignments: 12,
      registrations: 20,
      logisticsRequests: 6,
      delegates: 12,
      committees: 12,
    },
    total: 62,
    configured: true,
  },
}

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    apiFetch: vi.fn((path: string) => {
      if (!(path in RESPONSES)) throw new Error(`unstubbed path: ${path}`)
      return Promise.resolve(RESPONSES[path])
    }),
  }
})

describe('the admin page', () => {
  it('renders all five sections against stubbed responses', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <AdminPage />
        </ToastProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Conference details' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Prices' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Send allocation emails' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Audit log' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Danger zone' })).toBeInTheDocument()

    expect(await screen.findByDisplayValue('2500')).toBeInTheDocument()
    expect(screen.queryByText('Nobody has a seat yet')).toBeNull()
    expect(screen.getByText('No mail server is set up on this deployment.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send to 12 delegates/ })).toBeDisabled()
  })
})
