import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Download, Plus, Users } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { useCommittee, useDeleteLogistics, useUpdateLogistics } from '@/lib/hooks'
import { downloadExport } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CapacityMeter } from '@/components/ui/Card'
import { AttendanceBadge, RequestStatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States'
import { RequestCard, isBlocking } from '@/features/logistics/RequestCard'
import { RequestForm } from '@/features/logistics/RequestForm'
import { AwardsSection } from './AwardsSection'
import { ApiError } from '@/lib/api'
import type { LogisticsRequest, RequestStatus } from '@/types/api'

export function CommitteeDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'ADMIN'

  const [requestOpen, setRequestOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<LogisticsRequest | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const { data, isPending, isError, error, refetch } = useCommittee(id)
  const update = useUpdateLogistics()
  const remove = useDeleteLogistics()

  async function changeStatus(request: LogisticsRequest, next: RequestStatus) {
    setBusyId(request.id)
    try {
      await update.mutateAsync({ id: request.id, status: next })
    } catch (caught) {
      toast.error('Could not update', caught instanceof ApiError ? caught.message : undefined)
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await remove.mutateAsync(pendingDelete.id)
      toast.success('Request deleted', pendingDelete.title)
      setPendingDelete(null)
    } catch (caught) {
      toast.error('Could not delete', caught instanceof ApiError ? caught.message : undefined)
    }
  }

  async function handleExport() {
    try {
      await downloadExport(`dataset=delegates&format=xlsx&committeeId=${id}`, `${data?.code ?? 'committee'}-roster.xlsx`)
    } catch {
      toast.error('Export failed', 'The file could not be generated. Try again in a moment.')
    }
  }

  const backLink = (
    <Link
      to="/committees"
      className="inline-flex min-h-tap items-center gap-1.5 text-body-sm text-ink-secondary underline-offset-4 hover:text-ink hover:underline md:min-h-0"
    >
      <ArrowLeft size={16} aria-hidden />
      All committees
    </Link>
  )

  if (isPending) {
    return (
      <>
        {backLink}
        <div className="mt-4">
          <SkeletonRows rows={8} columns={4} />
        </div>
      </>
    )
  }

  if (isError) {
    const notFound = error instanceof ApiError && error.code === 404
    return (
      <>
        {backLink}
        <div className="mt-4">
          {notFound ? (
            <EmptyState
              icon={Users}
              title="That committee no longer exists"
              description="It may have been deleted. Head back to the list to pick another."
              action={<Button onClick={() => void navigate('/committees')}>Back to committees</Button>}
            />
          ) : (
            <ErrorState error={error} onRetry={() => void refetch()} />
          )}
        </div>
      </>
    )
  }

  const open = data.requests.filter((request) => request.status !== 'RESOLVED')
  const resolved = data.requests.filter((request) => request.status === 'RESOLVED')
  // Blocking work first — the same priority the logistics board uses.
  const sortedOpen = [...open].sort((a, b) => Number(isBlocking(b)) - Number(isBlocking(a)))

  const checkedIn = data.assignments.filter((seat) => seat.delegate.attendanceStatus === 'CHECKED_IN').length

  return (
    <>
      {backLink}

      <header className="mb-6 mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-display text-ink">{data.code}</h1>
          <p className="mt-1 text-body text-ink-secondary">{data.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void handleExport()}>
            <Download size={16} aria-hidden />
            Export roster
          </Button>
          <Button onClick={() => setRequestOpen(true)}>
            <Plus size={16} aria-hidden />
            Raise a request
          </Button>
        </div>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-edge bg-surface p-5">
          <p className="text-label uppercase text-ink-secondary">Seats filled</p>
          <p className="mt-2 font-heading text-display tabular-nums text-ink">
            {data.filledSeats}
            <span className="text-h2 text-ink-tertiary"> / {data.totalSeats}</span>
          </p>
          <div className="mt-3">
            <CapacityMeter filled={data.filledSeats} total={data.totalSeats} />
          </div>
        </div>
        <div className="rounded-card border border-edge bg-surface p-5">
          <p className="text-label uppercase text-ink-secondary">Checked in</p>
          <p className="mt-2 font-heading text-display tabular-nums text-ink">{checkedIn}</p>
          <p className="mt-1 text-body-sm text-ink-secondary">
            {data.filledSeats - checkedIn} still to arrive
          </p>
        </div>
        <div className="rounded-card border border-edge bg-surface p-5">
          <p className="text-label uppercase text-ink-secondary">Open requests</p>
          <p className={`mt-2 font-heading text-display tabular-nums ${open.length > 0 ? 'text-accent' : 'text-ink'}`}>
            {open.length}
          </p>
          <p className="mt-1 text-body-sm text-ink-secondary">
            {resolved.length} resolved
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* ---------------------------------- Roster --------------------------------- */}
        <Card>
          <CardHeader
            title="Delegates and countries"
            description={
              data.assignments.length === 0
                ? 'Nobody is allocated to this committee yet.'
                : `${data.assignments.length} allocated, listed by country.`
            }
            actions={
              isAdmin && data.seatsRemaining > 0 ? (
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/allocations">Allocate delegates</Link>
                </Button>
              ) : null
            }
          />

          {data.assignments.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No delegates yet"
              description={
                isAdmin
                  ? 'Allocate delegates to this committee and their countries will appear here.'
                  : 'The secretariat has not allocated anyone to this committee yet.'
              }
              action={
                isAdmin ? (
                  <Button asChild>
                    <Link to="/allocations">Go to allocations</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-left">
                <caption className="sr-only">
                  Delegates in {data.code} with their country, school and attendance
                </caption>
                <thead>
                  <tr className="border-b border-edge">
                    <th scope="col" className="pb-2 pr-4 text-label uppercase text-ink-secondary">Country</th>
                    <th scope="col" className="pb-2 pr-4 text-label uppercase text-ink-secondary">Delegate</th>
                    <th scope="col" className="pb-2 pr-4 text-label uppercase text-ink-secondary">School</th>
                    <th scope="col" className="pb-2 text-label uppercase text-ink-secondary">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assignments.map((seat) => (
                    <tr key={seat.id} className="border-b border-edge last:border-0">
                      <td className="py-3 pr-4 align-middle">
                        <span className="font-medium text-ink">{seat.country}</span>
                      </td>
                      <td className="py-3 pr-4 align-middle">
                        <span className="text-ink">{seat.delegate.fullName}</span>
                        <a
                          href={`tel:${seat.delegate.phone.replace(/\s/g, '')}`}
                          className="mt-0.5 block font-mono text-data text-ink-secondary underline-offset-2 hover:underline"
                        >
                          {seat.delegate.phone}
                        </a>
                      </td>
                      <td className="py-3 pr-4 align-middle text-body-sm text-ink-secondary">
                        {seat.delegate.schoolName}
                      </td>
                      <td className="py-3 align-middle">
                        <AttendanceBadge status={seat.delegate.attendanceStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* -------------------------------- Requests -------------------------------- */}
        <Card>
          <CardHeader
            title="Logistics requests"
            description={
              data.totalRequests === 0
                ? 'Nothing has been raised for this room.'
                : `${open.length} open, ${resolved.length} resolved. The full board across every committee is on Logistics.`
            }
            actions={
              <Button variant="secondary" size="sm" asChild>
                <Link to="/logistics">All requests</Link>
              </Button>
            }
          />

          {data.requests.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No requests for this committee"
              description="Anything this room needs — placards, stationery, a room change — can be raised here."
              action={
                <Button onClick={() => setRequestOpen(true)}>
                  <Plus size={16} aria-hidden />
                  Raise a request
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {sortedOpen.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  isAdmin={isAdmin}
                  busy={busyId === request.id}
                  onChangeStatus={(target, next) => void changeStatus(target, next)}
                  onDelete={setPendingDelete}
                />
              ))}

              {resolved.length > 0 ? (
                <details className="rounded-card border border-edge bg-surface-sunken p-4">
                  <summary className="cursor-pointer text-body-sm font-medium text-ink-secondary">
                    {resolved.length} resolved {resolved.length === 1 ? 'request' : 'requests'}
                  </summary>
                  <ul className="mt-3 flex flex-col gap-2">
                    {resolved.map((request) => (
                      <li
                        key={request.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-edge bg-surface p-3"
                      >
                        <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{request.title}</span>
                        <RequestStatusBadge status={request.status} />
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          )}
        </Card>

        {/* --------------------------------- Awards --------------------------------- */}
        <AwardsSection
          committeeId={data.id}
          committeeCode={data.code}
          awards={data.awards}
          seats={data.assignments}
          isAdmin={isAdmin}
        />
      </div>

      <RequestForm
        open={requestOpen}
        onOpenChange={setRequestOpen}
        committee={{ id: data.id, code: data.code }}
      />

      {isAdmin ? (
        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={(nextOpen) => !nextOpen && setPendingDelete(null)}
          title="Delete request?"
          description={pendingDelete ? `Delete “${pendingDelete.title}”? This cannot be undone.` : ''}
          onConfirm={() => void confirmDelete()}
          loading={remove.isPending}
        />
      ) : null}
    </>
  )
}
