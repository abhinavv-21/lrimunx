import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Search, UserCheck, UserX, Users } from 'lucide-react'
import { useOffline } from '@/providers/OfflineProvider'
import { useToast } from '@/providers/ToastProvider'
import { useIsAdmin } from '@/providers/AuthProvider'
import {
  useAttendanceSummary,
  useBulkCheckIn,
  useCommittees,
  useConference,
  useDebounced,
  useDelegates,
} from '@/lib/hooks'
import { ApiError, apiFetch, errorMessage } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar, SearchField } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { useCommitteeFilterOptions } from '@/lib/selectOptions'
import { Card, Stat } from '@/components/ui/Card'
import { Callout } from '@/components/ui/Callout'
import { EmptyState, ErrorState, SkeletonCards, SkeletonRows } from '@/components/ui/States'
import { DaySwitcher } from '@/features/conference/DaySwitcher'
import { defaultDay, findDay, formatDayDate } from '@/features/conference/conference'
import { cn, pluralise } from '@/lib/utils'
import type { AttendanceStatus, Delegate } from '@/types/api'

const ATTENDANCE_FILTERS: SelectOption[] = [
  { value: '', label: 'Everyone' },
  { value: 'ABSENT', label: 'Never arrived' },
  { value: 'CHECKED_IN', label: 'Seen at least once' },
]

/** Key for a check-in this session has confirmed, so a row can show it back. */
function markKey(day: number, delegateId: string): string {
  return `${day}:${delegateId}`
}

export function AttendancePage() {
  const [search, setSearch] = useState('')
  const [committeeId, setCommitteeId] = useState('')
  const [page, setPage] = useState(1)
  const [attendanceStatus, setAttendanceStatus] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkGroup, setBulkGroup] = useState<string | null>(null)
  const debouncedSearch = useDebounced(search)

  // Null means "follow the conference". A volunteer who never touches the tabs
  // moves on to day 2 the moment an admin does; one who is backfilling day 1
  // stays where they put themselves.
  const [chosenDay, setChosenDay] = useState<number | null>(null)

  const { isOnline, queue } = useOffline()
  const toast = useToast()
  const isAdmin = useIsAdmin()
  const queryClient = useQueryClient()

  const conference = useConference()
  const day = chosenDay ?? defaultDay(conference.data)
  const running = conference.data?.state === 'RUNNING'
  const activeDay = running ? conference.data?.activeDay : undefined

  const summary = useAttendanceSummary(day)
  const { data: committees } = useCommittees()
  const committeeOptions = useCommitteeFilterOptions(committees?.items)
  const bulk = useBulkCheckIn()

  // Only what this session has confirmed on the server. The delegates list
  // carries one attendance flag for the whole conference, not one per day, so
  // a row cannot otherwise know whether the person in front of you has already
  // been marked in for the day you are looking at.
  const [dayMarks, setDayMarks] = useState<ReadonlyMap<string, AttendanceStatus>>(new Map())

  const filters = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(committeeId ? { committeeId } : {}),
      ...(attendanceStatus ? { attendanceStatus } : {}),
      sortBy: 'committee',
      sortDir: 'asc' as const,
      page,
    }),
    [debouncedSearch, committeeId, attendanceStatus, page],
  )

  useEffect(() => setPage(1), [debouncedSearch, committeeId, attendanceStatus])

  const { data, isPending, isFetching, isError, error, refetch } = useDelegates(filters)

  const hasFilters = Boolean(debouncedSearch || committeeId || attendanceStatus)

  const groups = useMemo(() => {
    const byCommittee = new Map<string, { code: string; name: string; delegates: Delegate[] }>()

    for (const delegate of data?.items ?? []) {
      const key = delegate.assignment?.committee.id ?? '__unplaced'
      const existing = byCommittee.get(key)
      if (existing) {
        existing.delegates.push(delegate)
      } else {
        byCommittee.set(key, {
          code: delegate.assignment?.committee.code ?? 'Unplaced',
          name: delegate.assignment?.committee.name ?? 'No committee yet',
          delegates: [delegate],
        })
      }
    }

    return [...byCommittee.entries()]
      .sort(([keyA, a], [keyB, b]) => {
        if (keyA === '__unplaced') return 1
        if (keyB === '__unplaced') return -1
        return a.code.localeCompare(b.code)
      })
      .map(([key, group]) => ({
        key,
        ...group,
        delegates: [...group.delegates].sort((a, b) => a.fullName.localeCompare(b.fullName)),
      }))
  }, [data])

  // Rooms that are short come first: on day 2 the useful question is which
  // committee is missing people, not which one starts with A.
  const committeesByShortfall = useMemo(() => {
    const rows = summary.data?.committees ?? []
    return [...rows].sort((a, b) => {
      const gap = b.assigned - b.checkedIn - (a.assigned - a.checkedIn)
      return gap !== 0 ? gap : a.code.localeCompare(b.code)
    })
  }, [summary.data])

  function remember(delegateId: string, status: AttendanceStatus) {
    setDayMarks((current) => new Map(current).set(markKey(day, delegateId), status))
  }

  async function mark(delegate: Delegate, next: AttendanceStatus) {
    setBusyId(delegate.id)

    const queueIt = async (reason: string) => {
      const pending = await queue({
        kind: 'attendance',
        delegateId: delegate.id,
        delegateName: delegate.fullName,
        status: next,
      })
      toast.notify({
        tone: 'info',
        title: 'Saved on this device',
        description:
          day === activeDay || activeDay === undefined
            ? `${reason} ${delegate.fullName} will be marked ${next === 'CHECKED_IN' ? 'in' : 'absent'} when you reconnect — ${pluralise(pending, 'check-in')} waiting.`
            : `${reason} It will be sent against whichever day the conference is on when it goes, not day ${day}. Correct it here once you are back online.`,
      })
    }

    try {
      if (!isOnline) {
        await queueIt('You are offline.')
        return
      }

      await apiFetch('/attendance/check-in', {
        method: 'POST',
        body: { delegateId: delegate.id, status: next, day },
      })

      remember(delegate.id, next)

      void queryClient.invalidateQueries({ queryKey: ['delegates'] })
      void queryClient.invalidateQueries({ queryKey: ['attendance'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })

      toast.success(
        next === 'CHECKED_IN' ? `Checked in for day ${day}` : `Marked absent for day ${day}`,
        delegate.fullName,
      )
    } catch (caught) {
      if (caught instanceof ApiError && caught.isOffline) {
        await queueIt('The connection dropped.')
      } else {
        toast.error('Could not update attendance', errorMessage(caught))
      }
    } finally {
      setBusyId(null)
    }
  }

  async function checkInGroup(group: { key: string; code: string; delegates: Delegate[] }) {
    setBulkGroup(group.key)
    try {
      const result = await bulk.mutateAsync({
        delegateIds: group.delegates.map((delegate) => delegate.id),
        day,
        status: 'CHECKED_IN',
      })

      setDayMarks((current) => {
        const next = new Map(current)
        for (const delegate of group.delegates) next.set(markKey(day, delegate.id), 'CHECKED_IN')
        return next
      })

      toast.success(
        `${group.code} checked in for day ${day}`,
        result.unchanged > 0
          ? `${pluralise(result.updated, 'delegate')} marked in, ${result.unchanged} already were.`
          : pluralise(result.updated, 'delegate') + ' marked in.',
      )
    } catch (caught) {
      toast.error('Could not check the room in', errorMessage(caught))
    } finally {
      setBulkGroup(null)
    }
  }

  const today = findDay(conference.data?.days, day)

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Check delegates in as they arrive. Works offline — check-ins queue and send themselves."
      />

      {conference.data?.state === 'PREPARING' ? (
        <Callout tone="info" className="mb-6">
          The conference has not started, so everything here is recorded against day 1.
          {isAdmin ? ' Start it from the dashboard on the first morning.' : ''}
        </Callout>
      ) : null}

      {/* The day tabs open on whichever day the conference is on, so they wait
          for it rather than rendering day 1 and jumping. */}
      {summary.isPending || conference.isPending ? (
        <SkeletonCards count={3} />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <DaySwitcher
            days={summary.data.days.map((entry) => ({
              day: entry.day,
              date: entry.date,
              count: entry.checkedIn,
              of: summary.data.total,
            }))}
            value={day}
            onChange={setChosenDay}
            activeDay={activeDay}
            label="Attendance day"
          />

          <p className="mt-2 text-body-sm text-ink-secondary" aria-live="polite">
            Showing day {day}
            {today ? `, ${formatDayDate(today.date)}` : ''}
            {activeDay !== undefined && day !== activeDay
              ? ` — the conference is on day ${activeDay}. Anything you check in here lands on day ${day}.`
              : ''}
            {summary.isFetching ? ' · updating…' : ''}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Stat label={`Checked in · day ${day}`} value={summary.data.checkedIn} hint={`of ${summary.data.total} delegates`} />
            <Stat label="Still to arrive" value={summary.data.absent} emphasis={summary.data.absent > 0} />
            <Stat
              label="Turnout"
              value={summary.data.total > 0 ? `${Math.round((summary.data.checkedIn / summary.data.total) * 100)}%` : '—'}
            />
          </div>

          {committeesByShortfall.length > 0 ? (
            <Card className="mt-6">
              <h2 className="text-h2 text-ink">By committee, shortest first</h2>
              <p className="mt-1 text-body-sm text-ink-secondary">
                Counted for day {day} only. A room with a gap here is a room missing people today.
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {committeesByShortfall.map((committee) => {
                  const missing = committee.assigned - committee.checkedIn
                  return (
                    <li
                      key={committee.id}
                      className={cn(
                        'rounded-control border p-3',
                        missing > 0 ? 'border-warning/40 bg-warning-wash' : 'border-edge',
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-heading text-h3 text-ink">{committee.code}</span>
                        <span className="font-mono text-data tabular-nums text-ink-secondary">
                          {committee.checkedIn} / {committee.assigned}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-body-sm text-ink-secondary">{committee.name}</p>
                      <p
                        className={cn(
                          'mt-1 text-label uppercase',
                          missing > 0 ? 'text-warning' : committee.assigned > 0 ? 'text-success' : 'text-ink-tertiary',
                        )}
                      >
                        {committee.assigned === 0
                          ? 'Nobody seated'
                          : missing > 0
                            ? `${missing} still out`
                            : 'Everyone in'}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ) : null}
        </>
      )}

      <FilterBar className="mt-6">
        <SearchField value={search} onChange={setSearch} placeholder="Name, email or school" />
        <Field label="Committee">
          {({ id }) => (
            <Select id={id} value={committeeId} onChange={setCommitteeId} options={committeeOptions} />
          )}
        </Field>
        <Field label="Attendance" hint="Across all three days.">
          {({ id }) => (
            <Select id={id} value={attendanceStatus} onChange={setAttendanceStatus} options={ATTENDANCE_FILTERS} />
          )}
        </Field>
      </FilterBar>

      {isPending ? (
        <SkeletonRows rows={8} columns={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={Search}
            title="No delegates match"
            description="Try clearing the search box or choosing a different committee."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setCommitteeId('')
                  setAttendanceStatus('')
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="Nobody on the roster yet"
            description="Approve a registration or add a delegate, and they will appear here to be checked in."
          />
        )
      ) : (
        <div className="flex flex-col gap-8">
          <div>
            <p className="font-mono text-data text-ink-secondary" aria-live="polite">
              {data.total} {data.total === 1 ? 'delegate' : 'delegates'} on this list
              {isFetching ? ' · updating…' : ''}
            </p>

            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={setPage}
              noun="delegates"
            />
          </div>

          {groups.map((group) => {
            const seen = group.delegates.filter((d) => d.attendanceStatus === 'CHECKED_IN').length
            return (
              <section key={group.key}>
                <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-edge pb-2">
                  <div className="min-w-0">
                    <h2 className="font-heading text-h2 text-ink">{group.code}</h2>
                    <p className="truncate text-body-sm text-ink-secondary">{group.name}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-data tabular-nums text-ink-secondary">
                      {seen} / {group.delegates.length} seen
                    </span>
                    {isAdmin ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={bulkGroup === group.key}
                        disabled={!isOnline || (bulkGroup !== null && bulkGroup !== group.key)}
                        onClick={() => void checkInGroup(group)}
                        title={isOnline ? undefined : 'Bulk check-in needs a connection.'}
                      >
                        <UserCheck size={16} aria-hidden />
                        Check in these {group.delegates.length}
                      </Button>
                    ) : null}
                  </div>
                </header>

                <ul className="flex flex-col gap-2">
                  {group.delegates.map((delegate) => {
                    const marked = dayMarks.get(markKey(day, delegate.id))
                    const seenAnyDay = delegate.attendanceStatus === 'CHECKED_IN'

                    return (
                      <li
                        key={delegate.id}
                        className={cn(
                          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border bg-surface p-3 md:p-4',
                          marked === 'CHECKED_IN' ? 'border-success/50 bg-success-wash' : 'border-edge',
                        )}
                      >
                        <div className="min-w-0 flex-1 basis-48">
                          <p className="truncate text-body font-medium text-ink">{delegate.fullName}</p>
                          <p className="truncate text-body-sm text-ink-secondary">{delegate.schoolName}</p>
                          <p className="mt-0.5 font-mono text-data text-ink-secondary">
                            {delegate.assignment ? delegate.assignment.country : 'No country'} · {delegate.phone}
                          </p>
                        </div>

                        <span
                          className={cn(
                            'whitespace-nowrap text-label uppercase',
                            marked === 'CHECKED_IN'
                              ? 'text-success'
                              : marked === 'ABSENT'
                                ? 'text-warning'
                                : seenAnyDay
                                  ? 'text-ink-secondary'
                                  : 'text-ink-tertiary',
                          )}
                        >
                          {marked === 'CHECKED_IN'
                            ? `In · day ${day}`
                            : marked === 'ABSENT'
                              ? `Out · day ${day}`
                              : seenAnyDay
                                ? 'Seen at the conference'
                                : 'Never arrived'}
                        </span>

                        <div className="ml-auto flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busyId === delegate.id}
                            onClick={() => void mark(delegate, 'ABSENT')}
                            aria-label={`Mark ${delegate.fullName} absent for day ${day}`}
                          >
                            <UserX size={16} aria-hidden />
                            Absent
                          </Button>
                          <Button
                            size="sm"
                            loading={busyId === delegate.id}
                            onClick={() => void mark(delegate, 'CHECKED_IN')}
                            aria-label={`Check ${delegate.fullName} in for day ${day}`}
                          >
                            <UserCheck size={16} aria-hidden />
                            Check in
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
