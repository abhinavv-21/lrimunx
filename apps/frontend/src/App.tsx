import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'
import { AppShell } from '@/components/layout/AppShell'
import { PermissionDenied } from '@/components/ui/States'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DelegatesPage } from '@/features/delegates/DelegatesPage'
import { CommitteesPage } from '@/features/committees/CommitteesPage'
import { CommitteeDetailPage } from '@/features/committees/CommitteeDetailPage'
import { MatrixPage } from '@/features/matrix/MatrixPage'
import { AllocationsPage } from '@/features/allocations/AllocationsPage'
import { RegistrationsPage } from '@/features/registrations/RegistrationsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { LogisticsPage } from '@/features/logistics/LogisticsPage'
import { AttendancePage } from '@/features/attendance/AttendancePage'
import { UsersPage } from '@/features/users/UsersPage'
import { AuditPage } from '@/features/audit/AuditPage'
import { NotFoundPage } from '@/features/misc/NotFoundPage'
import type { Role } from '@/types/api'

function AdminOnly({ children, what }: { children: React.ReactNode; what: string }) {
  const { user } = useAuth()
  const role: Role | undefined = user?.role
  if (role !== 'ADMIN') return <PermissionDenied what={what} />
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
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="delegates" element={<DelegatesPage />} />
        <Route path="committees" element={<CommitteesPage />} />
        <Route path="committees/:id" element={<CommitteeDetailPage />} />
        {/* Reading is open to both roles; the page hides its own write
            controls for a contributor, and the server enforces it. */}
        <Route path="matrix" element={<MatrixPage />} />
        <Route path="logistics" element={<LogisticsPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        {/*
          Both roles read the queue — a contributor working the desk needs to
          see who has applied. Only an ADMIN can approve or reject, enforced on
          the server and reflected in the card's controls.
        */}
        <Route path="registrations" element={<RegistrationsPage />} />
        <Route
          path="allocations"
          element={<AdminOnly what="Allocating delegates"><AllocationsPage /></AdminOnly>}
        />
        <Route
          path="settings"
          element={<AdminOnly what="Conference settings"><SettingsPage /></AdminOnly>}
        />
        {/* Integrations became Settings when registration moved onto the site. */}
        <Route path="integrations" element={<Navigate to="/settings" replace />} />
        {/* The old assignments screen is now Allocations. */}
        <Route path="assignments" element={<Navigate to="/allocations" replace />} />
        <Route path="users" element={<AdminOnly what="User administration"><UsersPage /></AdminOnly>} />
        <Route path="audit" element={<AdminOnly what="The audit log"><AuditPage /></AdminOnly>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
