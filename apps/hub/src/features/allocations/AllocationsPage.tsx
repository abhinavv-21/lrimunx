import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Landmark, Search, Users } from 'lucide-react'
import { useCommittees, useDashboard, useDebounced, useDelegates } from '@/lib/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar, SearchField } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useCommitteeFilterOptions } from '@/lib/selectOptions'
import { Stat, CapacityMeter, Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States'
import { AllocationRow } from './AllocationRow'

export function AllocationsPage() {
  const [search, setSearch] = useState('')
  const [committeeFilter, setCommitteeFilter] = useState('')
  const [onlyUnallocated, setOnlyUnallocated] = useState(false)
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounced(search)

  const filters = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(committeeFilter ? { committeeId: committeeFilter } : {}),
      ...(onlyUnallocated ? { unassigned: true } : {}),
      sortBy: 'fullName',
      page,
    }),
    [debouncedSearch, committeeFilter, onlyUnallocated, page],
  )

  useEffect(() => setPage(1), [debouncedSearch, committeeFilter, onlyUnallocated])

  const { data, isPending, isError, error, refetch } = useDelegates(filters)
  const { data: committees, isPending: committeesPending } = useCommittees()

  const { data: summary } = useDashboard()
  const total = summary?.totalDelegates ?? 0
  const allocated = Math.max(0, total - (summary?.unassigned ?? 0))

  const committeeList = committees?.items ?? []
  const noCommittees = !committeesPending && committeeList.length === 0
  const committeeOptions = useCommitteeFilterOptions(committeeList)

  function clearFilters() {
    setSearch('')
    setCommitteeFilter('')
    setOnlyUnallocated(false)
  }

  const hasFilters = Boolean(search || committeeFilter || onlyUnallocated)

  return (
    <>
      <PageHeader
        title="Allocations"
        description="Place every delegate into a committee and country. Changes save as you make them."
      />

      {noCommittees ? (
        <EmptyState
          icon={Landmark}
          title="No committees to allocate into"
          description="Create the committees first — a delegate cannot be placed until there is a room to place them in."
          action={
            <Button asChild>
              <Link to="/committees">Go to Committees</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Allocated" value={allocated} hint={`of ${total} delegates`} />
            <Stat
              label="Still unallocated"
              value={Math.max(0, total - allocated)}
              emphasis={total - allocated > 0}
            />
            <Stat label="Committees" value={committeeList.length} />
          </div>

          {committeeList.length > 0 ? (
            <Card className="mt-6">
              <h2 className="text-h2 text-ink">Seats and countries</h2>
              <p className="mt-1 text-body-sm text-ink-secondary">
                What is left in each room. A country can only be held once per committee.
              </p>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {committeeList.map((committee) => (
                  <li key={committee.id}>
                    <CapacityMeter
                      filled={committee.filledSeats}
                      total={committee.totalSeats}
                      label={committee.code}
                    />
                    <p className="mt-1.5 text-body-sm text-ink-secondary">
                      {committee.seatsRemaining > 0 ? (
                        <span className="text-ink">{committee.seatsRemaining} open</span>
                      ) : (
                        <span className="text-danger">Full</span>
                      )}
                      {committee.takenCountries && committee.takenCountries.length > 0 ? (
                        <>
                          {' · '}
                          <span title={committee.takenCountries.map((t) => t.country).join(', ')}>
                            {committee.takenCountries.length} allocated
                          </span>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <FilterBar className="mt-6">
            <SearchField value={search} onChange={setSearch} placeholder="Name or school" />

            <Field label="Committee">
              {({ id }) => (
                <Select
                  id={id}
                  value={committeeFilter}
                  onChange={setCommitteeFilter}
                  options={committeeOptions}
                />
              )}
            </Field>

            <div className="flex items-end">
              <label className="flex min-h-tap w-full items-center gap-3 rounded-control border border-edge-strong bg-surface px-3 text-body-sm text-ink md:min-h-10">
                <input
                  type="checkbox"
                  checked={onlyUnallocated}
                  onChange={(event) => setOnlyUnallocated(event.target.checked)}
                  className="size-4 rounded-control accent-accent"
                />
                Only unallocated
              </label>
            </div>
          </FilterBar>

          {isPending ? (
            <SkeletonRows rows={8} columns={3} />
          ) : isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={hasFilters ? Search : Users}
              title={hasFilters ? 'Nothing matches those filters' : 'No delegates yet'}
              description={
                hasFilters
                  ? 'Try clearing the filters, or turn off "Only unallocated" — everyone may already be placed.'
                  : 'Add delegates or import a CSV first, then come back here to place them.'
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
                ) : (
                  <Button asChild>
                    <Link to="/delegates">Go to Delegates</Link>
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="mb-3 hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_auto] gap-4 px-4 md:grid">
                <span className="text-label uppercase text-ink-secondary">Delegate and preference</span>
                <span className="text-label uppercase text-ink-secondary">Committee</span>
                <span className="text-label uppercase text-ink-secondary">Country</span>
                <span className="w-16" />
              </div>

              <ul className="flex flex-col gap-2">
                {data.items.map((delegate) => (
                  <AllocationRow key={delegate.id} delegate={delegate} committees={committeeList} />
                ))}
              </ul>

              <p className="mt-4 flex items-center gap-2 text-body-sm text-ink-secondary">
                <ClipboardList size={16} aria-hidden />
                Showing {data.items.length} of {data.total}. A country must be unique within its committee.
              </p>

              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onPageChange={setPage}
                noun="delegates"
              />
            </>
          )}
        </>
      )}
    </>
  )
}
