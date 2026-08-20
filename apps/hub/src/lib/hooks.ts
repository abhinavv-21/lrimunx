import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import type {
  AnnounceBatch,
  AnnouncePreview,
  AttendanceStatus,
  AttendanceSummary,
  AuditEntry,
  AuthUser,
  Award,
  AwardInput,
  BulkCheckInResult,
  Committee,
  CommitteeDetail,
  ConferenceMode,
  DashboardData,
  Delegate,
  DelegateInput,
  IngestResult,
  LedgerEntry,
  LedgerEntryInput,
  LedgerPage,
  LedgerSummary,
  LogisticsPage,
  LogisticsRequest,
  MailResult,
  MatrixCommittee,
  MatrixImportResult,
  Paginated,
  Registration,
  RegistrationStats,
  ResetPreview,
  ResetResult,
  RestartResult,
  Settings,
  TierPrices,
} from '@/types/api'

export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return settled
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export function useDashboard(): UseQueryResult<DashboardData> {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardData>('/dashboard'),
  })
}

/**
 * Whether the conference is running and which day it is on.
 *
 * Half the hub reads this — the header pill, the attendance day tabs, the
 * logistics board — so it is one query key that every one of them shares
 * rather than a provider. The staleTime is short because an admin flipping the
 * day on their phone needs the volunteer's tab to catch up within a refetch,
 * not on a page reload.
 */
export function useConference(): UseQueryResult<ConferenceMode> {
  return useQuery({
    queryKey: ['conference'],
    queryFn: () => apiFetch<ConferenceMode>('/conference'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

function conferenceChanged(queryClient: ReturnType<typeof useQueryClient>, mode: ConferenceMode) {
  queryClient.setQueryData(['conference'], mode)
  // The active day is an input to both of these: attendance counts the day it
  // is told to, and logistics scores age twelve times faster once RUNNING.
  void queryClient.invalidateQueries({ queryKey: ['attendance'] })
  void queryClient.invalidateQueries({ queryKey: ['logistics'] })
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
}

export function useStartConference() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<ConferenceMode>('/conference/start', { method: 'POST' }),
    onSuccess: (mode) => conferenceChanged(queryClient, mode),
  })
}

export function useSetConferenceDay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (day: number) =>
      apiFetch<ConferenceMode>('/conference/day', { method: 'POST', body: { day } }),
    onSuccess: (mode) => conferenceChanged(queryClient, mode),
  })
}

export interface DelegateFilters {
  search?: string
  attendanceStatus?: string
  committeeId?: string
  unassigned?: boolean

  sortBy?: string
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export function useDelegates(filters: DelegateFilters = {}) {
  return useQuery({
    queryKey: ['delegates', filters],
    queryFn: () => apiFetch<Paginated<Delegate>>(`/delegates${qs({ ...filters })}`),
    placeholderData: keepPreviousData,
  })
}

export function useCreateDelegate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: DelegateInput) => apiFetch<Delegate>('/delegates', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delegates'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['committees'] })
      void queryClient.invalidateQueries({ queryKey: ['attendance'] })
      void queryClient.invalidateQueries({ queryKey: ['matrix'] })
    },
  })
}

export function useUpdateDelegate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<DelegateInput> & { id: string }) =>
      apiFetch<Delegate>(`/delegates/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delegates'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['committees'] })
      void queryClient.invalidateQueries({ queryKey: ['attendance'] })
      void queryClient.invalidateQueries({ queryKey: ['matrix'] })
    },
  })
}

export function useDeleteDelegate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/delegates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delegates'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['committees'] })
      void queryClient.invalidateQueries({ queryKey: ['matrix'] })
    },
  })
}

export function useCommittees() {
  return useQuery({
    queryKey: ['committees'],
    queryFn: () => apiFetch<{ items: Committee[] }>('/committees'),
    staleTime: 5 * 60_000,
  })
}

export function useCommittee(id: string | null) {
  return useQuery({
    queryKey: ['committees', id],
    queryFn: () => apiFetch<CommitteeDetail>(`/committees/${id}`),
    enabled: Boolean(id),
  })
}

export function useSaveCommittee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string; name: string; code: string; totalSeats: number }) =>
      id
        ? apiFetch<Committee>(`/committees/${id}`, { method: 'PATCH', body })
        : apiFetch<Committee>('/committees', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['committees'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteCommittee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/committees/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['committees'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

function useAwardInvalidation(committeeId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['committees', committeeId] })
    void queryClient.invalidateQueries({ queryKey: ['committees'] })
  }
}

export function useCreateAward(committeeId: string) {
  const invalidate = useAwardInvalidation(committeeId)
  return useMutation({
    mutationFn: (body: AwardInput) =>
      apiFetch<Award>(`/committees/${committeeId}/awards`, { method: 'POST', body }),
    onSuccess: invalidate,
  })
}

/**
 * Creates several awards at once.
 *
 * The standard set used to be four awaited useCreateAward calls in a loop, and
 * each one invalidated the committee on success. That is four POSTs and four
 * refetches, strictly in sequence: eight round trips to write four rows, which
 * on a remote database took long enough that people assumed it had hung.
 *
 * The requests go together and the cache is invalidated once at the end.
 * allSettled rather than all, because a partial failure should still show the
 * rows that were created rather than throwing them away visually.
 */
export function useCreateAwards(committeeId: string) {
  const invalidate = useAwardInvalidation(committeeId)
  return useMutation({
    mutationFn: async (bodies: AwardInput[]) => {
      const results = await Promise.allSettled(
        bodies.map((body) =>
          apiFetch<Award>(`/committees/${committeeId}/awards`, { method: 'POST', body }),
        ),
      )

      const created = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.find((r) => r.status === 'rejected')

      return { created, total: bodies.length, error: failed?.reason as unknown }
    },
    onSuccess: invalidate,
  })
}

export function useUpdateAward(committeeId: string) {
  const invalidate = useAwardInvalidation(committeeId)
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<AwardInput> & { id: string }) =>
      apiFetch<Award>(`/committees/${committeeId}/awards/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  })
}

export function useDeleteAward(committeeId: string) {
  const invalidate = useAwardInvalidation(committeeId)
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/committees/${committeeId}/awards/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export interface LogisticsFilters {
  status?: string
  category?: string
  committeeId?: string
  day?: number
  mine?: boolean
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  page?: number
}

/**
 * One board's worth of requests. It used to ask for 200 and render whatever
 * came back, which meant request 201 existed and nobody ever saw it; the page
 * now pages through the whole set instead.
 */
export const LOGISTICS_PAGE_SIZE = 50

export function useLogistics(filters: LogisticsFilters = {}) {
  return useQuery({
    queryKey: ['logistics', filters],
    queryFn: () =>
      apiFetch<LogisticsPage>(`/logistics-requests${qs({ ...filters, pageSize: LOGISTICS_PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  })
}

function invalidateRequestViews(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['logistics'] })
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  void queryClient.invalidateQueries({ queryKey: ['committees'] })
}

export function useUpdateLogistics() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: string; title?: string; description?: string }) =>
      apiFetch<LogisticsRequest>(`/logistics-requests/${id}`, { method: 'PATCH', body }),
    onSuccess: () => invalidateRequestViews(queryClient),
  })
}

export function useDeleteLogistics() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/logistics-requests/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateRequestViews(queryClient),
  })
}

/**
 * Attendance for one day, plus the totals for all three.
 *
 * `day` undefined means "whichever day the conference is on", which is what
 * the dashboard wants. The attendance page names a day explicitly so switching
 * tabs cannot be raced by an admin moving the conference on.
 */
export function useAttendanceSummary(day?: number) {
  return useQuery({
    queryKey: ['attendance', 'summary', day ?? 'active'],
    queryFn: () => apiFetch<AttendanceSummary>(`/attendance/summary${qs({ day })}`),
    // Keeps the previous day's numbers on screen while the next day loads, so
    // a tab press does not blank the counts someone is reading off.
    placeholderData: keepPreviousData,
  })
}

export function useBulkCheckIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { delegateIds: string[]; day: number; status: AttendanceStatus }) =>
      apiFetch<BulkCheckInResult>('/attendance/bulk-check-in', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delegates'] })
      void queryClient.invalidateQueries({ queryKey: ['attendance'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<Paginated<AuthUser & { createdAt: string }>>('/users?pageSize=200'),
  })
}

export function useSaveUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string; username?: string; fullName?: string; role?: string; password?: string }) =>
      id
        ? apiFetch<AuthUser>(`/users/${id}`, { method: 'PATCH', body })
        : apiFetch<AuthUser>('/users', { method: 'POST', body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

export interface RegistrationFilters {
  status?: string
  search?: string
}

export function useRegistrations(filters: RegistrationFilters = {}) {
  return useQuery({
    queryKey: ['registrations', filters],
    queryFn: () =>
      apiFetch<Paginated<Registration>>(`/registrations${qs({ ...filters })}`),
    placeholderData: keepPreviousData,
  })
}

export function useRegistrationStats() {
  return useQuery({
    queryKey: ['registrations', 'stats'],
    queryFn: () => apiFetch<RegistrationStats>('/registrations/stats'),
  })
}

function useRegistrationInvalidation() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['registrations'] })
    void queryClient.invalidateQueries({ queryKey: ['delegates'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export function useApproveRegistration() {
  const invalidate = useRegistrationInvalidation()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ registration: Registration; delegate: Delegate; email: MailResult }>(
        `/registrations/${id}/approve`,
        { method: 'POST' },
      ),
    onSuccess: invalidate,
  })
}

export function useRejectRegistration() {
  const invalidate = useRegistrationInvalidation()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiFetch<Registration>(`/registrations/${id}/reject`, {
        method: 'POST',
        body: reason ? { reason } : {},
      }),
    onSuccess: invalidate,
  })
}

export function useDeleteRegistration() {
  const invalidate = useRegistrationInvalidation()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/registrations/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

const AUDIT_PAGE_SIZE = 50

export function useAuditLog(
  filters: { entityType?: string; action?: string; search?: string } = {},
  page = 1,
) {
  return useQuery({
    queryKey: ['audit', filters, page],
    queryFn: () =>
      apiFetch<Paginated<AuditEntry>>(`/audit-logs${qs({ ...filters, page, pageSize: AUDIT_PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  })
}

export function useClearAuditLog() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<{ deleted: number }>('/audit-logs', { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<Settings>('/settings'),
    staleTime: 5 * 60_000,
  })
}

export function useSaveSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Settings>) => apiFetch<Settings>('/settings', { method: 'PUT', body }),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data)
    },
  })
}

export function useCsvImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ csv, upsert }: { csv: string; upsert: boolean }) =>
      apiFetch<IngestResult>('/integrations/csv', { method: 'POST', body: { csv, upsert } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delegates'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useMatrix() {
  return useQuery({
    queryKey: ['matrix'],
    queryFn: () => apiFetch<{ items: MatrixCommittee[] }>('/matrix'),
  })
}

function invalidateMatrix(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['matrix'] })
  void queryClient.invalidateQueries({ queryKey: ['committees'] })
  void queryClient.invalidateQueries({ queryKey: ['delegates'] })
}

export function useImportMatrix() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ csv, mode }: { csv: string; mode: 'merge' | 'replace' }) =>
      apiFetch<MatrixImportResult>('/matrix/import', { method: 'POST', body: { csv, mode } }),
    onSuccess: () => invalidateMatrix(queryClient),
  })
}

export function useAddMatrixCountry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ committeeId, country }: { committeeId: string; country: string }) =>
      apiFetch<{ id: string; country: string }>('/matrix', { method: 'POST', body: { committeeId, country } }),
    onSuccess: () => invalidateMatrix(queryClient),
  })
}

export function useRemoveMatrixCountry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/matrix/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateMatrix(queryClient),
  })
}

export function useResetPreview() {
  return useQuery({
    queryKey: ['danger', 'reset-preview'],
    queryFn: () => apiFetch<ResetPreview>('/danger/reset/preview'),
  })
}

export function useResetConference() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (passphrase: string) =>
      apiFetch<ResetResult>('/danger/reset', { method: 'POST', body: { passphrase } }),
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

export function usePricing() {
  return useQuery({
    queryKey: ['pricing'],
    queryFn: () => apiFetch<TierPrices>('/settings/pricing'),
    staleTime: 5 * 60_000,
  })
}

export function useRecordPayment() {
  const invalidateRegistrations = useRegistrationInvalidation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; priceTier: string; amountPaid?: number }) =>
      apiFetch<Registration>(`/registrations/${id}/payment`, { method: 'POST', body }),
    onSuccess: () => {
      invalidateRegistrations()

      void queryClient.invalidateQueries({ queryKey: ['ledger'] })
    },
  })
}

export interface LedgerFilters {
  category?: string

  from?: string
  to?: string
  search?: string
  page?: number
}

export function useLedger(filters: LedgerFilters = {}) {
  return useQuery({
    queryKey: ['ledger', 'entries', filters],
    queryFn: () => apiFetch<LedgerPage>(`/ledger${qs({ ...filters })}`),
    placeholderData: keepPreviousData,
  })
}

export function useLedgerSummary() {
  return useQuery({
    queryKey: ['ledger', 'summary'],
    queryFn: () => apiFetch<LedgerSummary>('/ledger/summary'),
  })
}

function useLedgerInvalidation() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: ['ledger'] })
}

export function useSaveLedgerEntry() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: ({ id, ...body }: LedgerEntryInput & { id?: string }) =>
      id
        ? apiFetch<LedgerEntry>(`/ledger/${id}`, { method: 'PATCH', body })
        : apiFetch<LedgerEntry>('/ledger', { method: 'POST', body }),
    onSuccess: invalidate,
  })
}

export function useDeleteLedgerEntry() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/ledger/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useSavePricing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<TierPrices>) =>
      apiFetch<TierPrices>('/settings/pricing', { method: 'PUT', body }),
    onSuccess: (data) => {
      queryClient.setQueryData(['pricing'], data)
      void queryClient.invalidateQueries({ queryKey: ['registrations'] })
    },
  })
}

export function useAnnouncePreview(includeStudyGuide: boolean) {
  return useQuery({
    queryKey: ['announce', includeStudyGuide],
    queryFn: () =>
      apiFetch<AnnouncePreview>(`/allocations/announce/preview${qs({ includeStudyGuide })}`),
  })
}

/**
 * One batch of allocation emails. The caller loops on it until the server says
 * `done`, which is why nothing is invalidated here: a refetch of the preview
 * between batches would pull four hundred rows down for every twenty-five sent.
 * The screen refetches once, when the run ends.
 */
export function useAnnounceBatch() {
  return useMutation({
    mutationFn: (body: { passphrase: string; includeStudyGuide: boolean }) =>
      apiFetch<AnnounceBatch>('/allocations/announce', { method: 'POST', body }),
  })
}

export function useClearAnnounceFailures() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ cleared: number }>('/allocations/announce/reset-failures', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['announce'] })
      void queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useRestartConference() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (passphrase: string) =>
      apiFetch<RestartResult>('/danger/restart-conference', { method: 'POST', body: { passphrase } }),
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
