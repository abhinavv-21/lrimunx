import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Search, UserCheck, UserX } from 'lucide-react'
import { useOffline } from '@/providers/OfflineProvider'
import { useToast } from '@/providers/ToastProvider'
import { useAttendanceSummary, useCommittees, useDebounced, useDelegates } from '@/lib/hooks'
import { ApiError, apiFetch } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Card, Stat } from '@/components/ui/Card'
import { AttendanceBadge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, SkeletonCards, SkeletonRows } from '@/components/ui/States'
import type { AttendanceStatus, Delegate } from '@/types/api'

export function AttendancePage() {
  const [search, setSearch] = useState('')
  const [committeeId, setCommitteeId] = useState('')
  const [attendanceStatus, setAttendanceStatus] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const debouncedSearch = useDebounced(search)

  const { isOnline, queue } = useOffline()
  const toast = useToast()
  const queryClient = useQueryClient()

  const summary = useAttendanceSummary()
  const { data: committees } = useCommittees()

  const filters = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(committeeId ? { committeeId } : {}),
      ...(attendanceStatus ? { attendanceStatus } : {}),
      // Committee first, then alphabetical within it — the order the desk works.
      sortBy: 'committee',
      sortDir: 'asc' as const,
    }),
    [debouncedSearch, committeeId, attendanceStatus],
  )

  const { data, isPending, isFetching, isError, error, refetch } = useDelegates(filters)

  /** Committee-ordered groups, unplaced delegates last. */
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

  /**
   * Check-in is the one write most likely to happen with no signal, so it
   * queues on failure exactly like a logistics request does.
   */
  async function toggle(delegate: Delegate) {
    const next: AttendanceStatus = delegate.attendanceStatus === 'CHECKED_IN' ? 'ABSENT' : 'CHECKED_IN'
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
        description: `${reason} ${delegate.fullName} will be marked ${next === 'CHECKED_IN' ? 'checked in' : 'absent'} when you reconnect — ${pending} waiting.`,
      })
    }

    try {
      if (!isOnline) {
        await queueIt('You are offline.')
        return
      }

      await apiFetch('/attendance/check-in', {
        method: 'POST',
        body: { delegateId: delegate.id, status: next },
      })

      /*
        The desk is told as soon as the server has it, not when three lists
        have finished reloading.

        These were awaited in sequence, and one of them is the whole roster —
        about 100KB at conference size. So the button stayed spinning and the
        next person in the queue waited through a full refetch that changes one
        badge. Fired and left to land: the row updates a moment later either
        way, and the person in front of the desk moves on now.
      */
      void queryClient.invalidateQueries({ queryKey: ['delegates'] })
      void queryClient.invalidateQueries({ queryKey: ['attendance'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })

      toast.success(
        next === 'CHECKED_IN' ? 'Checked in' : 'Marked absent',
        delegate.fullName,
      )
    } catch (caught) {
      if (caught instanceof ApiError && caught.isOffline) {
        await queueIt('The connection dropped.')
      } else {
        toast.error('Could not update attendance', caught instanceof Error ? caught.message : undefined)
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Check delegates in as they arrive. Works offline — check-ins queue and send themselves."
      />

      {summary.isPending ? (
        <SkeletonCards count={3} />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Checked in" value={summary.data.checkedIn} hint={`of ${summary.data.total} delegates`} />
            <Stat label="Still absent" value={summary.data.absent} emphasis={summary.data.absent > 0} />
            <Stat
              label="Turnout"
              value={summary.data.total > 0 ? `${Math.round((summary.data.checkedIn / summary.data.total) * 100)}%` : '—'}
            />
          </div>

          {summary.data.committees.length > 0 ? (
            <Card className="mt-6">
              <h2 className="text-h2 text-ink">By committee</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summary.data.committees.map((committee) => (
                  <li key={committee.id} className="rounded-control border border-edge p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-heading text-h3 text-ink">{committee.code}</span>
                      <span className="font-mono text-data tabular-nums text-ink-secondary">
                        {committee.checkedIn} / {committee.assigned}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-body-sm text-ink-secondary">{committee.name}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}

      <div className="my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Search">
          {({ id }) => (
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" aria-hidden />
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
        <Field label="Status">
          {({ id }) => (
            <Select id={id} value={attendanceStatus} onChange={(event) => setAttendanceStatus(event.target.value)}>
              <option value="">Everyone</option>
              <option value="ABSENT">Not yet arrived</option>
              <option value="CHECKED_IN">Checked in</option>
            </Select>
          )}
        </Field>
      </div>

      {isPending ? (
        <SkeletonRows rows={8} columns={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
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
        <div className="flex flex-col gap-8">
          <div>
            <p className="font-mono text-data text-ink-secondary" aria-live="polite">
              {data.total} {data.total === 1 ? 'delegate' : 'delegates'} on this list
              {isFetching ? ' · updating…' : ''}
            </p>

            {/*
              The roster comes back capped and this screen has no next page. A
              desk with a queue in front of it must not be able to reach the
              bottom of the list, fail to find someone, and turn them away —
              when the only problem is that they are row 214.
            */}
            {data.items.length < data.total ? (
              <p className="mt-3 rounded-control border border-warning bg-warning-wash p-3 text-body-sm text-ink">
                Only the first {data.items.length} are shown. Search for anyone you cannot see here,
                or filter by their committee — they are on the roster, just below the cut.
              </p>
            ) : null}
          </div>

          {groups.map((group) => {
            const present = group.delegates.filter((d) => d.attendanceStatus === 'CHECKED_IN').length
            return (
              <section key={group.key}>
                <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-edge pb-2">
                  <div className="min-w-0">
                    <h2 className="font-heading text-h2 text-ink">{group.code}</h2>
                    <p className="truncate text-body-sm text-ink-secondary">{group.name}</p>
                  </div>
                  <span className="font-mono text-data tabular-nums text-ink-secondary">
                    {present} / {group.delegates.length} checked in
                  </span>
                </header>

                <ul className="flex flex-col gap-2">
                  {group.delegates.map((delegate) => {
                    const checkedIn = delegate.attendanceStatus === 'CHECKED_IN'
                    return (
                      <li
                        key={delegate.id}
                        className="flex flex-wrap items-center gap-3 rounded-card border border-edge bg-surface p-3 md:p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body font-medium text-ink">{delegate.fullName}</p>
                          <p className="truncate text-body-sm text-ink-secondary">{delegate.schoolName}</p>
                          <p className="mt-0.5 font-mono text-data text-ink-secondary">
                            {delegate.assignment ? delegate.assignment.country : 'No country'} · {delegate.phone}
                          </p>
                        </div>

                        <AttendanceBadge status={delegate.attendanceStatus} />

                        <Button
                          variant={checkedIn ? 'secondary' : 'primary'}
                          size="sm"
                          loading={busyId === delegate.id}
                          onClick={() => void toggle(delegate)}
                          aria-label={
                            checkedIn ? `Mark ${delegate.fullName} absent` : `Check in ${delegate.fullName}`
                          }
                        >
                          {checkedIn ? <UserX size={16} aria-hidden /> : <UserCheck size={16} aria-hidden />}
                          {checkedIn ? 'Undo' : 'Check in'}
                        </Button>
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
