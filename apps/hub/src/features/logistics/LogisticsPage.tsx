import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, ChevronDown, CircleDot, LoaderCircle, PackageSearch, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useIsAdmin } from '@/providers/AuthProvider'
import { useOffline } from '@/providers/OfflineProvider'
import { useToast } from '@/providers/ToastProvider'
import {
  useCommittees,
  useConference,
  useDeleteLogistics,
  useLogistics,
  useUpdateLogistics,
} from '@/lib/hooks'
import { discardQueued, offlineDb } from '@/lib/offline'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { useCommitteeFilterOptions } from '@/lib/selectOptions'
import { Card } from '@/components/ui/Card'
import { Callout } from '@/components/ui/Callout'
import { QueuedBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States'
import { RequestForm } from './RequestForm'
import { RequestCard } from './RequestCard'
import { byNewest, byPriority } from './priority'
import { formatDayDate } from '@/features/conference/conference'
import { formatDateTime } from '@/lib/utils'
import type { LogisticsRequest, RequestStatus } from '@/types/api'

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

const CATEGORY_FILTERS: SelectOption[] = [
  { value: '', label: 'All categories' },
  { value: 'PLACARD', label: 'Placard' },
  { value: 'STATIONERY', label: 'Stationery' },
  { value: 'AWARDS', label: 'Awards' },
  { value: 'LOGISTICS', label: 'Logistics' },
]

const SORT_OPTIONS: SelectOption[] = [
  { value: 'priority', label: 'Most urgent first', hint: 'Category and how long it has waited' },
  { value: 'newest', label: 'Newest first' },
]

const ALL_DAYS = ''

/** The count of open requests is the number someone scans for, so it is not a footnote. */
function laneCountClass(loud: boolean): string {
  return loud
    ? 'font-heading text-h2 tabular-nums text-warning'
    : 'font-mono text-data tabular-nums text-ink-secondary'
}

export function LogisticsPage() {
  const { pending, sync, state } = useOffline()
  const toast = useToast()
  const isAdmin = useIsAdmin()

  const [category, setCategory] = useState('')
  const [committeeId, setCommitteeId] = useState('')
  const [sort, setSort] = useState('priority')
  const [page, setPage] = useState(1)
  const [showResolved, setShowResolved] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LogisticsRequest | null>(null)

  const conference = useConference()
  const running = conference.data?.state === 'RUNNING'

  // Null means "follow the conference". During the conference the board opens
  // on today, because yesterday's resolved placard hunt is not what anyone
  // standing at the desk needs to scroll past.
  const [chosenDay, setChosenDay] = useState<string | null>(null)
  const day = chosenDay ?? (running ? String(conference.data?.activeDay ?? '') : ALL_DAYS)

  const dayOptions = useMemo<SelectOption[]>(
    () => [
      { value: ALL_DAYS, label: 'All days' },
      ...(conference.data?.days ?? []).map((entry) => ({
        value: String(entry.day),
        label: `Day ${entry.day}`,
        hint: formatDayDate(entry.date),
      })),
    ],
    [conference.data],
  )

  const filters = useMemo(
    () => ({
      ...(category ? { category } : {}),
      ...(committeeId ? { committeeId } : {}),
      ...(day !== ALL_DAYS ? { day: Number(day) } : {}),
      // "Newest" is the server's own default ordering, so it is expressed by
      // asking for no sort at all rather than by a second sort key.
      ...(sort === 'priority' ? { sortBy: 'priority', sortDir: 'desc' as const } : {}),
      page,
    }),
    [category, committeeId, day, sort, page],
  )

  const { data, isPending, isError, error, refetch } = useLogistics(filters)
  const { data: committees } = useCommittees()
  const update = useUpdateLogistics()
  const remove = useDeleteLogistics()
  const committeeOptions = useCommitteeFilterOptions(committees?.items)

  const queued = useLiveQuery(() => offlineDb.queue.orderBy('createdAt').toArray(), [], [])
  const queuedLogistics = queued.filter((item) => item.payload.kind === 'logistics')

  const lanes = useMemo(() => {
    const items = data?.items ?? []
    const order = sort === 'priority' ? byPriority : byNewest

    return {
      OPEN: [...items.filter((r) => r.status === 'OPEN')].sort(order),
      IN_PROGRESS: [...items.filter((r) => r.status === 'IN_PROGRESS')].sort(order),
      RESOLVED: [...items.filter((r) => r.status === 'RESOLVED')].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    }
  }, [data, sort])

  const hasFilters = Boolean(category || committeeId)
  const dayScoped = day !== ALL_DAYS
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  // The server scores at most 500 rows before ranking them. Past that the board
  // is a window, and saying so beats letting someone believe they have seen it all.
  const windowed =
    data?.priorityWindow !== undefined && data.priorityWindow < data.total ? data.priorityWindow : null

  function clearFilters() {
    setCategory('')
    setCommitteeId('')
    setPage(1)
  }

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
            ? 'What the floor needs, ordered by urgency. The longer something waits, the higher it climbs.'
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

      <FilterBar>
        <Field label="Day">
          {({ id }) => (
            <Select
              id={id}
              value={day}
              onChange={(next) => {
                setChosenDay(next)
                setPage(1)
              }}
              options={dayOptions}
            />
          )}
        </Field>
        <Field label="Category">
          {({ id }) => (
            <Select
              id={id}
              value={category}
              onChange={(next) => {
                setCategory(next)
                setPage(1)
              }}
              options={CATEGORY_FILTERS}
            />
          )}
        </Field>
        <Field label="Committee">
          {({ id }) => (
            <Select
              id={id}
              value={committeeId}
              onChange={(next) => {
                setCommitteeId(next)
                setPage(1)
              }}
              options={committeeOptions}
            />
          )}
        </Field>
        <Field label="Order">
          {({ id }) => (
            <Select
              id={id}
              value={sort}
              onChange={(next) => {
                setSort(next)
                setPage(1)
              }}
              options={SORT_OPTIONS}
            />
          )}
        </Field>
      </FilterBar>

      {windowed !== null ? (
        <Callout tone="warning" className="mb-6">
          Ranking the {windowed} most recent of {data?.total} requests. Anything older is not in this
          order — filter by day or by committee to reach it.
        </Callout>
      ) : null}

      {/* Waiting on the conference too: the day filter defaults to today once it
          arrives, and a board that renders every day first and then narrows is a
          board someone has already started reading. */}
      {isPending || conference.isPending ? (
        <SkeletonRows rows={4} columns={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={
            hasFilters
              ? 'Nothing matches those filters'
              : dayScoped
                ? `Nothing raised on day ${day} yet`
                : 'Nothing outstanding'
          }
          description={
            hasFilters
              ? 'Try clearing the filters to see the whole board.'
              : dayScoped
                ? 'The floor has not asked for anything today. Requests from other days are still there under All days.'
                : 'When a committee needs a placard, stationery, an award or anything from the venue, raise it here and the desk sees it immediately.'
          }
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : dayScoped ? (
              <Button variant="secondary" onClick={() => setChosenDay(ALL_DAYS)}>
                Show every day
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
          {pages > 1 ? (
            <p className="text-body-sm text-ink-secondary" aria-live="polite">
              Page {page} of {pages}. The lanes below hold this page only — page on at the bottom for
              the rest.
            </p>
          ) : null}

          {LANES.map((lane) => {
            const items = lanes[lane.status]
            const LaneIcon = lane.icon

            return (
              <section key={lane.status}>
                <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-edge pb-2">
                  <div className="flex items-center gap-2">
                    <LaneIcon size={18} className={lane.tone} aria-hidden />
                    <h2 className="font-heading text-h2 text-ink">{lane.title}</h2>
                    <span className={laneCountClass(lane.status === 'OPEN' && items.length > 0)}>
                      {items.length}
                    </span>
                  </div>
                  <p className="text-body-sm text-ink-secondary">{lane.blurb}</p>
                </header>

                {items.length === 0 ? (
                  <p className="rounded-card border border-dashed border-edge px-4 py-6 text-center text-body-sm text-ink-secondary">
                    {lane.status === 'OPEN'
                      ? 'Nothing waiting. The desk is clear.'
                      : 'Nobody is mid-task. Pick something up from above.'}
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
                className="-mx-2 flex min-h-tap w-full items-center gap-2 rounded-control border-b border-edge px-2 pb-2 text-left transition-colors duration-micro hover:bg-surface-sunken active:bg-edge md:min-h-11"
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

          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
            noun="requests"
          />
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
