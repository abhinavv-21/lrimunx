import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, useCanManageUsers, useIsAdmin } from '@/providers/AuthProvider'
import { AppShell } from '@/components/layout/AppShell'
import { PermissionDenied } from '@/components/ui/States'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'

const DelegatesPage = lazy(() => import('@/features/delegates/DelegatesPage').then((m) => ({ default: m.DelegatesPage })))
const CommitteesPage = lazy(() => import('@/features/committees/CommitteesPage').then((m) => ({ default: m.CommitteesPage })))
const CommitteeDetailPage = lazy(() => import('@/features/committees/CommitteeDetailPage').then((m) => ({ default: m.CommitteeDetailPage })))
const MatrixPage = lazy(() => import('@/features/matrix/MatrixPage').then((m) => ({ default: m.MatrixPage })))
const AllocationsPage = lazy(() => import('@/features/allocations/AllocationsPage').then((m) => ({ default: m.AllocationsPage })))
const RegistrationsPage = lazy(() => import('@/features/registrations/RegistrationsPage').then((m) => ({ default: m.RegistrationsPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const LogisticsPage = lazy(() => import('@/features/logistics/LogisticsPage').then((m) => ({ default: m.LogisticsPage })))
const AttendancePage = lazy(() => import('@/features/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })))
const UsersPage = lazy(() => import('@/features/users/UsersPage').then((m) => ({ default: m.UsersPage })))
const AuditPage = lazy(() => import('@/features/audit/AuditPage').then((m) => ({ default: m.AuditPage })))
const NotFoundPage = lazy(() => import('@/features/misc/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

function AdminOnly({
  children,
  what,
  requires,
}: {
  children: React.ReactNode
  what: string

  requires?: 'canManageUsers'
}) {
  const isAdmin = useIsAdmin()
  const canManageUsers = useCanManageUsers()
  if (!isAdmin) return <PermissionDenied what={what} />
  if (requires === 'canManageUsers' && !canManageUsers) return <PermissionDenied what={what} />
  return <>{children}</>
}

function FullPageLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <span className="page-rule" aria-hidden />
        <p className="text-body-sm text-ink-secondary">Restoring your session…</p>
      </div>
    </div>
  )
}

function RouteLoading() {
  return (
    <div className="grid min-h-64 place-items-center" role="status" aria-live="polite">
      <p className="text-body-sm text-ink-secondary">Loading…</p>
    </div>
  )
}

export function App() {
  const { status } = useAuth()

  if (status === 'loading') return <FullPageLoading />

  if (status === 'anonymous') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="delegates" element={<DelegatesPage />} />
          <Route path="committees" element={<CommitteesPage />} />
          <Route path="committees/:id" element={<CommitteeDetailPage />} />

          <Route path="matrix" element={<MatrixPage />} />
          <Route path="logistics" element={<LogisticsPage />} />
          <Route path="attendance" element={<AttendancePage />} />

          <Route path="registrations" element={<RegistrationsPage />} />
          <Route
            path="allocations"
            element={<AdminOnly what="Allocating delegates"><AllocationsPage /></AdminOnly>}
          />
          <Route
            path="settings"
            element={<AdminOnly what="Conference settings"><SettingsPage /></AdminOnly>}
          />

          <Route path="integrations" element={<Navigate to="/settings" replace />} />

          <Route path="assignments" element={<Navigate to="/allocations" replace />} />
          <Route
            path="users"
            element={
              <AdminOnly what="User administration" requires="canManageUsers">
                <UsersPage />
              </AdminOnly>
            }
          />
          <Route path="audit" element={<AdminOnly what="The audit log"><AuditPage /></AdminOnly>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
