import { Link } from 'react-router-dom'
import { Inbox, PackageSearch } from 'lucide-react'
import { useAuth, useIsAdmin, useIsOwner } from '@/providers/AuthProvider'
import { useDashboard, useRegistrationStats } from '@/lib/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader, CapacityMeter, Stat } from '@/components/ui/Card'
import { CategoryBadge, RequestStatusBadge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, SkeletonCards } from '@/components/ui/States'
import { Button } from '@/components/ui/Button'
import { formatDateTime } from '@/lib/utils'

export function DashboardPage() {
  const { user } = useAuth()
  const { data, isPending, isError, error, refetch } = useDashboard()
  const { data: registrationStats } = useRegistrationStats()
  const isAdmin = useIsAdmin()
  const isOwner = useIsOwner()
  const pendingRegistrations = registrationStats?.pending ?? 0

  return (
    <>
      <PageHeader
        title={`Good to see you, ${user?.fullName.split(' ')[0] ?? 'there'}`}
        description={
          isAdmin
            ? 'Where the conference stands right now — seats, attendance and open requests.'
            : 'Your board for the day. Raise anything the desk needs to know about.'
        }
      />

      {isAdmin && pendingRegistrations > 0 ? (
        <Link
          to="/registrations"
          className="mb-6 flex min-h-tap items-center gap-3 rounded-card border border-accent bg-accent-wash p-4 text-body text-ink transition-colors duration-micro hover:bg-surface"
        >
          <Inbox size={20} className="shrink-0 text-accent" aria-hidden />
          <span className="flex-1">
            <strong className="font-medium">
              {pendingRegistrations} {pendingRegistrations === 1 ? 'registration is' : 'registrations are'} waiting
            </strong>
            <span className="text-ink-secondary"> — review and add them to the roster.</span>
          </span>
        </Link>
      ) : null}

      {isPending ? (
        <SkeletonCards count={isAdmin ? 4 : 3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="flex flex-col gap-6 md:gap-8">

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Open requests"
              value={data.openRequests}
              hint={`${data.inProgressRequests} in progress`}
              emphasis={data.openRequests > 0}
            />
            <Stat label="Checked in" value={data.checkedIn} hint={`of ${data.totalDelegates} delegates`} />
            {isAdmin ? (
              <>
                <Stat label="Unplaced" value={data.unassigned ?? 0} hint="No committee yet" />
                <Stat label="Delegates" value={data.totalDelegates} hint={`${data.absent} still absent`} />
              </>
            ) : (
              <Stat label="Absent" value={data.absent} hint="Not yet checked in" />
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Committee capacity"

                description={
                  data.capacity.length === 1
                    ? 'Seats filled in the one committee.'
                    : `Seats filled across the ${data.capacity.length} committees.`
                }
                actions={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/committees">View all</Link>
                  </Button>
                }
              />
              {data.capacity.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No committees yet"
                  description="An admin needs to create the committees before delegates can be assigned."
                />
              ) : (
                <ul className="flex flex-col gap-4">
                  {data.capacity.map((committee) => (
                    <li key={committee.id}>
                      <CapacityMeter
                        filled={committee.filledSeats}
                        total={committee.totalSeats}
                        label={committee.code}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title={isAdmin ? 'Latest requests' : 'Your recent requests'}
                actions={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/logistics">Open logistics</Link>
                  </Button>
                }
              />
              {data.recentRequests.length === 0 ? (
                <EmptyState
                  icon={PackageSearch}
                  title="Nothing raised yet"
                  description={
                    isAdmin
                      ? 'Requests from the floor will appear here as they come in.'
                      : 'Anything you raise from the Logistics tab will show up here.'
                  }
                  action={
                    <Button asChild variant="secondary">
                      <Link to="/logistics">Raise a request</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="flex flex-col divide-y divide-edge">
                  {data.recentRequests.map((request) => (
                    <li key={request.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body text-ink">{request.title}</p>
                        <p className="mt-0.5 font-mono text-data text-ink-secondary">
                          {request.committee?.code ?? 'General'} · {formatDateTime(request.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <CategoryBadge category={request.category} />
                        <RequestStatusBadge status={request.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {isAdmin && data.recentAudit && data.recentAudit.length > 0 ? (
            <Card>
              <CardHeader
                title="Recent activity"
                actions={
                  isOwner ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/settings">Full audit log</Link>
                    </Button>
                  ) : null
                }
              />
              <ul className="flex flex-col divide-y divide-edge">
                {data.recentAudit.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-body-sm text-ink">{entry.user.fullName}</span>
                    <span className="text-body-sm text-ink-secondary">
                      {entry.action.toLowerCase()} · {entry.entityType}
                    </span>
                    <span className="ml-auto font-mono text-data text-ink-secondary">
                      {formatDateTime(entry.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
    </>
  )
}
