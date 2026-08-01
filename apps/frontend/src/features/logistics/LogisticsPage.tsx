import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, ChevronDown, CircleDot, LoaderCircle, PackageSearch, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useOffline } from '@/providers/OfflineProvider'
import { useToast } from '@/providers/ToastProvider'
import { useCommittees, useDeleteLogistics, useLogistics, useUpdateLogistics } from '@/lib/hooks'
import { discardQueued, offlineDb } from '@/lib/offline'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { Card } from '@/components/ui/Card'
import { QueuedBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States'
import { RequestForm } from './RequestForm'
import { RequestCard, isBlocking } from './RequestCard'
import { formatDateTime } from '@/lib/utils'
import type { LogisticsRequest, RequestStatus } from '@/types/api'

/**
 * The board is grouped by what the desk should do next rather than presented
 * as one flat list: what needs picking up, what someone is already on, and
 * what is finished. Resolved work is collapsed so it stops competing for
 * attention.
 */
const LANES = [
  {
    status: 'OPEN' as const,
    title: 'Needs attention',
    blurb: 'Raised and waiting for someone to pick up.',
    icon: CircleDot,
    tone: 'text-warning',
  },
  {
    status: 'IN_PROGRESS' as const,
    title: 'Being handled',
    blurb: 'Someone is on it right now.',
    icon: LoaderCircle,
    tone: 'text-info',
  },
]

export function LogisticsPage() {
  const { user } = useAuth()
  const { pending, sync, state } = useOffline()
  const toast = useToast()
  const isAdmin = user?.role === 'ADMIN'

  const [category, setCategory] = useState('')
  const [committeeId, setCommitteeId] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LogisticsRequest | null>(null)

  const filters = useMemo(
    () => ({ ...(category ? { category } : {}), ...(committeeId ? { committeeId } : {}) }),
    [category, committeeId],
  )

  const { data, isPending, isError, error, refetch } = useLogistics(filters)
  const { data: committees } = useCommittees()
  const update = useUpdateLogistics()
  const remove = useDeleteLogistics()

  // Anything still waiting on this device, shown first so a volunteer never
  // wonders whether their request went through.
  const queued = useLiveQuery(() => offlineDb.queue.orderBy('createdAt').toArray(), [], [])
  const queuedLogistics = queued.filter((item) => item.payload.kind === 'logistics')

  /** Blocking items float to the top of their lane, then oldest first. */
  const lanes = useMemo(() => {
    const items = data?.items ?? []
    const order = (list: LogisticsRequest[]) =>
      [...list].sort((a, b) => {
        const blockingDiff = Number(isBlocking(b)) - Number(isBlocking(a))
        if (blockingDiff !== 0) return blockingDiff
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })

    return {
      OPEN: order(items.filter((r) => r.status === 'OPEN')),
      IN_PROGRESS: order(items.filter((r) => r.status === 'IN_PROGRESS')),
      RESOLVED: [...items.filter((r) => r.status === 'RESOLVED')].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    }
  }, [data])

  const hasFilters = Boolean(category || committeeId)
  const totalActive = lanes.OPEN.length + lanes.IN_PROGRESS.length

  async function changeStatus(request: LogisticsRequest, next: RequestStatus) {
    setBusyId(request.id)
    try {
      await update.mutateAsync({ id: request.id, status: next })
      toast.success(
        next === 'RESOLVED' ? 'Marked resolved' : next === 'IN_PROGRESS' ? 'Picked up' : 'Reopened',
        request.title,
      )
    } catch (caught) {
      toast.error('Could not update', caught instanceof Error ? caught.message : undefined)
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
      toast.error('Could not delete', caught instanceof Error ? caught.message : undefined)
    }
  }

  return (
    <>
      <PageHeader
        title="Logistics"
        description={
          isAdmin
            ? 'What the floor needs, ordered by urgency. Blocking items come first.'
            : 'Raise anything a committee needs. Works offline — it sends itself when you reconnect.'
        }
        actions={
          <>
            {pending > 0 ? (
              <Button variant="secondary" onClick={() => void sync()} loading={state === 'syncing'}>
                <RefreshCw size={16} aria-hidden />
                Sync {pending}
              </Button>
            ) : null}
            <Button onClick={() => setFormOpen(true)}>
              <Plus size={16} aria-hidden />
              Raise request
            </Button>
          </>
        }
      />

      {queuedLogistics.length > 0 ? (
        <Card className="mb-6 border-warning bg-warning-wash">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-h3 text-ink">Waiting to send</h2>
              <p className="mt-1 text-body-sm text-ink-secondary">
                Saved on this device. They send automatically when the connection returns.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void sync()} loading={state === 'syncing'}>
              <RefreshCw size={16} aria-hidden />
              Try now
            </Button>
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            {queuedLogistics.map((item) => {
              if (item.payload.kind !== 'logistics') return null
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-control border border-warning/40 bg-surface p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-ink">{item.payload.title}</p>
                    <p className="mt-0.5 font-mono text-data text-ink-secondary">
                      {formatDateTime(new Date(item.createdAt).toISOString())}
                      {item.lastError ? ` · ${item.lastError}` : ''}
                    </p>
                  </div>
                  <QueuedBadge />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Discard queued request ${item.payload.title}`}
                    onClick={() => void discardQueued(item.id)}
                  >
                    <Trash2 size={16} aria-hidden />
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:max-w-lg">
        <Field label="Category">
          {({ id }) => (
            <Select id={id} value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              <option value="PLACARD">Placard</option>
              <option value="STATIONERY">Stationery</option>
              <option value="AWARDS">Awards</option>
              <option value="LOGISTICS">Logistics</option>
            </Select>
          )}
        </Field>
        <Field label="Committee">
          {({ id }) => (
            <Select id={id} value={committeeId} onChange={(event) => setCommitteeId(event.target.value)}>
              <option value="">All committees</option>
              {committees?.items.map((committee) => (
                <option key={committee.id} value={committee.id}>{committee.code}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {isPending ? (
        <SkeletonRows rows={4} columns={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : totalActive === 0 && lanes.RESOLVED.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={hasFilters ? 'Nothing matches those filters' : 'Nothing outstanding'}
          description={
            hasFilters
              ? 'Try clearing the filters to see the whole board.'
              : 'When a committee needs a placard, stationery, an award or anything from the venue, raise it here and the desk sees it immediately.'
          }
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={() => { setCategory(''); setCommitteeId('') }}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => setFormOpen(true)}>
                <Plus size={16} aria-hidden />
                Raise request
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {LANES.map((lane) => {
            const items = lanes[lane.status]
            const LaneIcon = lane.icon

            return (
              <section key={lane.status}>
                <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-edge pb-2">
                  <div className="flex items-center gap-2">
                    <LaneIcon size={18} className={lane.tone} aria-hidden />
                    <h2 className="font-heading text-h2 text-ink">{lane.title}</h2>
                    <span className="font-mono text-data tabular-nums text-ink-secondary">{items.length}</span>
                  </div>
                  <p className="text-body-sm text-ink-secondary">{lane.blurb}</p>
                </header>

                {items.length === 0 ? (
                  <p className="rounded-card border border-dashed border-edge px-4 py-6 text-center text-body-sm text-ink-secondary">
                    {lane.status === 'OPEN' ? 'Nothing waiting. ' : 'Nobody is mid-task. '}
                    {lane.status === 'OPEN' ? 'The desk is clear.' : 'Pick something up from above.'}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {items.map((request) => (
                      <li key={request.id}>
                        <RequestCard
                          request={request}
                          isAdmin={isAdmin}
                          busy={busyId === request.id}
                          onChangeStatus={(r, next) => void changeStatus(r, next)}
                          onDelete={setPendingDelete}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}

          {lanes.RESOLVED.length > 0 ? (
            <section>
              <button
                type="button"
                onClick={() => setShowResolved((open) => !open)}
                aria-expanded={showResolved}
                className="flex min-h-tap w-full items-center gap-2 border-b border-edge pb-2 text-left md:min-h-11"
              >
                <CheckCircle2 size={18} className="text-success" aria-hidden />
                <h2 className="font-heading text-h2 text-ink">Resolved</h2>
                <span className="font-mono text-data tabular-nums text-ink-secondary">
                  {lanes.RESOLVED.length}
                </span>
                <ChevronDown
                  size={18}
                  className={`ml-auto text-ink-secondary transition-transform duration-standard ${showResolved ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>

              {showResolved ? (
                <ul className="mt-3 flex flex-col gap-3">
                  {lanes.RESOLVED.map((request) => (
                    <li key={request.id}>
                      <RequestCard
                        request={request}
                        isAdmin={isAdmin}
                        busy={busyId === request.id}
                        onChangeStatus={(r, next) => void changeStatus(r, next)}
                        onDelete={setPendingDelete}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      <RequestForm open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete request?"
        description={pendingDelete ? `Delete "${pendingDelete.title}"? This cannot be undone.` : ''}
        onConfirm={() => void confirmDelete()}
        loading={remove.isPending}
      />
    </>
  )
}
