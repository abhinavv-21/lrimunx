import { useMemo, useState } from 'react'
import { Inbox, Search } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import {
  useApproveRegistration,
  useDeleteRegistration,
  useRegistrationStats,
  useRegistrations,
  useRejectRegistration,
} from '@/lib/hooks'
import { ApiError } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Stat } from '@/components/ui/Card'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States'
import { RegistrationCard } from './RegistrationCard'
import type { Registration } from '@/types/api'

/** Reject needs a reason field, so it gets a dialog rather than a bare confirm. */
function RejectDialog({
  registration,
  onOpenChange,
  onConfirm,
  loading,
}: {
  registration: Registration | null
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')

  return (
    <Modal
      open={registration !== null}
      onOpenChange={(open) => {
        if (!open) setReason('')
        onOpenChange(open)
      }}
      title="Reject this registration?"
      description={
        registration
          ? `${registration.fullName} from ${registration.schoolName} will not be added to the roster.`
          : ''
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Reason" hint="Kept on the record so the decision can be explained later.">
          {({ id }) => (
            <Textarea
              id={id}
              rows={3}
              value={reason}
              maxLength={300}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Duplicate submission — already registered under another email."
            />
          )}
        </Field>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button loading={loading} onClick={() => onConfirm(reason.trim())}>
            Reject
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function RegistrationsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'ADMIN'

  const [status, setStatus] = useState('PENDING')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<Registration | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Registration | null>(null)

  const filters = useMemo(
    () => ({ ...(status ? { status } : {}), ...(search ? { search } : {}) }),
    [status, search],
  )

  const { data, isPending, isError, error, refetch } = useRegistrations(filters)
  const { data: stats } = useRegistrationStats()
  const approve = useApproveRegistration()
  const reject = useRejectRegistration()
  const remove = useDeleteRegistration()

  async function handleApprove(registration: Registration) {
    setBusyId(registration.id)
    try {
      const result = await approve.mutateAsync(registration.id)
      toast.success(
        'Added to the roster',
        `${result.delegate.fullName} — allocate them a committee in Allocations.`,
      )
    } catch (caught) {
      toast.error(
        'Could not approve',
        caught instanceof ApiError ? caught.message : 'Try again in a moment.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(reason: string) {
    if (!rejecting) return
    setBusyId(rejecting.id)
    try {
      await reject.mutateAsync({ id: rejecting.id, ...(reason ? { reason } : {}) })
      toast.success('Registration rejected', rejecting.fullName)
      setRejecting(null)
    } catch (caught) {
      toast.error('Could not reject', caught instanceof ApiError ? caught.message : undefined)
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await remove.mutateAsync(pendingDelete.id)
      toast.success('Registration deleted', pendingDelete.reference)
      setPendingDelete(null)
    } catch (caught) {
      toast.error('Could not delete', caught instanceof ApiError ? caught.message : undefined)
    }
  }

  const hasFilters = search !== '' || status !== 'PENDING'

  return (
    <>
      <PageHeader
        title="Registrations"
        description={
          isAdmin
            ? 'Submissions from the public site. Approving one adds them to the delegate roster — it never creates an account here.'
            : 'Submissions from the public site. Only an admin can approve or reject.'
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Pending" value={stats?.pending ?? '—'} emphasis={(stats?.pending ?? 0) > 0} />
        <Stat label="Approved" value={stats?.approved ?? '—'} />
        <Stat label="Rejected" value={stats?.rejected ?? '—'} />
        <Stat label="Total" value={stats?.total ?? '—'} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Field label="Search">
          {({ id }) => (
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
                aria-hidden
              />
              <Input
                id={id}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, email or school"
                className="pl-9"
              />
            </div>
          )}
        </Field>

        <Field label="Status">
          {({ id }) => (
            <Select id={id} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="PENDING">Pending review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="">All</option>
            </Select>
          )}
        </Field>
      </div>

      {isPending ? (
        <SkeletonRows rows={5} columns={4} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={status === 'PENDING' ? 'Nothing waiting for review' : 'No registrations here'}
          description={
            hasFilters
              ? 'Nothing matches those filters. Try widening them.'
              : 'When someone registers on the conference site, their submission lands here for approval.'
          }
          action={
            hasFilters ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setStatus('PENDING')
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-3 font-mono text-data text-ink-secondary" aria-live="polite">
            {data.total} {data.total === 1 ? 'registration' : 'registrations'}
          </p>
          <div className="flex flex-col gap-3">
            {data.items.map((registration) => (
              <RegistrationCard
                key={registration.id}
                registration={registration}
                isAdmin={isAdmin}
                busy={busyId === registration.id}
                onApprove={(target) => void handleApprove(target)}
                onReject={setRejecting}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        </>
      )}

      {isAdmin ? (
        <>
          <RejectDialog
            registration={rejecting}
            onOpenChange={(open) => !open && setRejecting(null)}
            onConfirm={(reason) => void handleReject(reason)}
            loading={reject.isPending}
          />
          <ConfirmDialog
            open={pendingDelete !== null}
            onOpenChange={(open) => !open && setPendingDelete(null)}
            title="Delete this registration?"
            description={
              pendingDelete
                ? `Permanently remove ${pendingDelete.reference} — ${pendingDelete.fullName}. Any delegate already created from it is left untouched. This cannot be undone.`
                : ''
            }
            onConfirm={() => void confirmDelete()}
            loading={remove.isPending}
          />
        </>
      ) : null}
    </>
  )
}
