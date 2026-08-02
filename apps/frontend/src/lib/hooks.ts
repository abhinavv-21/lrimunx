import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { apiFetch } from './api'
import type {
  AttendanceSummary,
  AuditEntry,
  AuthUser,
  Award,
  AwardInput,
  Committee,
  CommitteeDetail,
  DashboardData,
  Delegate,
  DelegateInput,
  IngestResult,
  LogisticsRequest,
  MatrixCommittee,
  MatrixImportResult,
  Paginated,
  Registration,
  RegistrationStats,
  ResetPreview,
  ResetResult,
  Settings,
} from '@/types/api'

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

/* -------------------------------- Dashboard ------------------------------- */

export function useDashboard(): UseQueryResult<DashboardData> {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardData>('/dashboard'),
  })
}

/* -------------------------------- Delegates ------------------------------- */

export interface DelegateFilters {
  search?: string
  attendanceStatus?: string
  committeeId?: string
  unassigned?: boolean
  /** 'committee' orders by committee code, then alphabetically by name. */
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export function useDelegates(filters: DelegateFilters = {}) {
  return useQuery({
    queryKey: ['delegates', filters],
    queryFn: () => apiFetch<Paginated<Delegate>>(`/delegates${qs({ ...filters, pageSize: filters.pageSize ?? 200 })}`),
  })
}

/** Committee and country are part of the delegate payload — see DelegateInput. */
export function useCreateDelegate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: DelegateInput) => apiFetch<Delegate>('/delegates', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delegates'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['committees'] })
      void queryClient.invalidateQueries({ queryKey: ['attendance'] })
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
    },
  })
}

/* ------------------------------- Committees ------------------------------- */

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

/* --------------------------------- Awards --------------------------------- */
// Awards hang off a committee, so every mutation refreshes that committee's
// detail as well as the list (whose cards carry an award count).

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

/* -------------------------------- Logistics ------------------------------- */

export interface LogisticsFilters {
  status?: string
  category?: string
  committeeId?: string
  mine?: boolean
  search?: string
}

export function useLogistics(filters: LogisticsFilters = {}) {
  return useQuery({
    queryKey: ['logistics', filters],
    queryFn: () => apiFetch<Paginated<LogisticsRequest>>(`/logistics-requests${qs({ ...filters, pageSize: 200 })}`),
  })
}

// Committee detail embeds this committee's slice of the same requests, so a
// status change made from either screen has to refresh both.
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

/* -------------------------------- Attendance ------------------------------ */

export function useAttendanceSummary() {
  return useQuery({
    queryKey: ['attendance', 'summary'],
    queryFn: () => apiFetch<AttendanceSummary>('/attendance/summary'),
  })
}

/* ---------------------------------- Users --------------------------------- */

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

/* ------------------------------ Registrations ----------------------------- */
// Submissions from the public website. Approving one creates a Delegate, so
// every mutation invalidates the roster and the dashboard too.

export interface RegistrationFilters {
  status?: string
  search?: string
}

export function useRegistrations(filters: RegistrationFilters = {}) {
  return useQuery({
    queryKey: ['registrations', filters],
    queryFn: () =>
      apiFetch<Paginated<Registration>>(`/registrations${qs({ ...filters, pageSize: 200 })}`),
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
      apiFetch<{ registration: Registration; delegate: Delegate }>(
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

/* ---------------------------------- Audit --------------------------------- */

export function useAuditLog(filters: { entityType?: string; action?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => apiFetch<Paginated<AuditEntry>>(`/audit-logs${qs({ ...filters, pageSize: 100 })}`),
  })
}

/** Wipes the trail, leaving a single entry recording that it was cleared. */
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

/* --------------------------------- Settings ------------------------------- */

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

/* ------------------------------- Integrations ----------------------------- */

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

/* ------------------------------ Country matrix ---------------------------- */

export function useMatrix() {
  return useQuery({
    queryKey: ['matrix'],
    queryFn: () => apiFetch<{ items: MatrixCommittee[] }>('/matrix'),
  })
}

/**
 * Importing the matrix invalidates committees and delegates as well.
 *
 * Committees carry `matrixCountries`, which is what turns the allocation
 * country field into a pick-list — a stale copy would leave an operator typing
 * into a box the server has just started constraining.
 */
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

/* ------------------------------- Danger zone ------------------------------ */

export function useResetPreview() {
  return useQuery({
    queryKey: ['danger', 'reset-preview'],
    queryFn: () => apiFetch<ResetPreview>('/danger/reset/preview'),
  })
}

/**
 * Wipes the conference. Every cached list is now wrong, so the whole cache goes
 * rather than a list of keys that would drift out of date as screens are added.
 */
export function useResetConference() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (passphrase: string) =>
      apiFetch<ResetResult>('/danger/reset', { method: 'POST', body: { passphrase } }),
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
