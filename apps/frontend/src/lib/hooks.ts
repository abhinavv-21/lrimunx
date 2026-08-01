import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { apiFetch } from './api'
import type {
  AttendanceSummary, AuditEntry, Award, AwardInput, Committee, CommitteeDetail, DashboardData,
  Delegate, DelegateInput, IngestResult, LogisticsRequest, Paginated, Settings, AuthUser,
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
