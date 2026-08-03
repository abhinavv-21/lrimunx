import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Globe2, Plus, Trash2, Upload } from 'lucide-react'
import { useAddMatrixCountry, useMatrix, useRemoveMatrixCountry } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import { useAuth } from '@/providers/AuthProvider'
import { ApiError, errorMessage } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, Stat } from '@/components/ui/Card'
import { Input } from '@/components/ui/Field'
import { EmptyState, ErrorState, SkeletonCards } from '@/components/ui/States'
import { cn } from '@/lib/utils'
import { MatrixImportDialog } from './MatrixImportDialog'
import type { MatrixCommittee } from '@/types/api'

/**
 * One committee's list. Taken countries are named, not merely marked — the
 * question an allocator has is "who has France?", and answering it with a grey
 * pill sends them to another screen to find out.
 */
function CommitteeMatrix({ committee, isAdmin }: { committee: MatrixCommittee; isAdmin: boolean }) {
  const [adding, setAdding] = useState('')
  const add = useAddMatrixCountry()
  const remove = useRemoveMatrixCountry()
  const toast = useToast()

  const taken = committee.countries.filter((c) => c.delegateId).length
  const open = committee.countries.length - taken

  async function handleAdd() {
    const country = adding.trim()
    if (!country) return
    try {
      await add.mutateAsync({ committeeId: committee.id, country })
      setAdding('')
      toast.success('Added to the matrix', `${country} — ${committee.code}`)
    } catch (caught) {
      toast.error(errorMessage(caught, 'That could not be added.'))
    }
  }

  async function handleRemove(id: string, country: string) {
    try {
      await remove.mutateAsync(id)
      toast.success('Removed from the matrix', `${country} — ${committee.code}`)
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'That could not be removed.')
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-h3 text-ink">
            {committee.code}
            <span className="ml-2 text-body-sm font-normal text-ink-secondary">{committee.name}</span>
          </h3>
        </div>
        <p className="text-body-sm text-ink-secondary">
          {committee.countries.length === 0 ? (
            <span className="text-warning">No matrix — any country is accepted</span>
          ) : (
            <>
              {committee.countries.length} countries · {open} open · {taken} taken
              {committee.countries.length !== committee.totalSeats ? (
                // Not an error — a matrix may deliberately be longer than the
                // room, so the secretariat can choose which countries to run.
                <span className="ml-1 text-ink-tertiary">({committee.totalSeats} seats)</span>
              ) : null}
            </>
          )}
        </p>
      </div>

      {committee.offMatrix.length > 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-control border border-warning bg-warning-wash p-2.5 text-body-sm text-ink">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>
            Allocated to a country that is not on this matrix:{' '}
            {committee.offMatrix.map((o) => `${o.country} (${o.delegateName})`).join(', ')}. These were
            placed before the matrix existed — add the country here, or move the delegate.
          </span>
        </p>
      ) : null}

      {committee.countries.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {committee.countries.map((c) => (
            <li key={c.id}>
              <span
                className={cn(
                  'inline-flex min-h-tap items-center gap-1.5 rounded-control border py-1 pl-2 text-body-sm md:min-h-10',
                  isAdmin && !c.delegateId ? 'pr-0' : 'pr-2',
                  c.delegateId
                    ? 'border-edge bg-surface-sunken text-ink-secondary'
                    : 'border-edge-strong text-ink',
                )}
              >
                {c.country}
                {c.delegateName ? (
                  <span className="text-ink-tertiary">— {c.delegateName}</span>
                ) : null}
                {/*
                  Removing a country is destructive and instant. At 13×13px on a
                  phone, with the pills sitting a few pixels apart, choosing
                  which country to drop was a matter of luck — the icon stays
                  the same size, the thing you press does not.
                */}
                {isAdmin && !c.delegateId ? (
                  <button
                    type="button"
                    className="grid size-tap shrink-0 place-items-center rounded-control text-ink-tertiary transition-colors duration-micro hover:text-danger md:size-10"
                    aria-label={`Remove ${c.country} from ${committee.code}`}
                    onClick={() => void handleRemove(c.id, c.country)}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {isAdmin ? (
        <div className="mt-3 flex gap-2">
          <Input
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            placeholder={`Add a country to ${committee.code}`}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleAdd()
              }
            }}
          />
          <Button variant="secondary" onClick={() => void handleAdd()} disabled={!adding.trim()} className="shrink-0">
            <Plus size={16} aria-hidden />
            Add
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

/**
 * The country matrix — which countries sit in which committee.
 *
 * A different fact from who has been allocated: the matrix is authored before
 * anyone is placed and outlives every allocation. Once a committee has one, the
 * server accepts only those countries for it, so this screen is the thing that
 * decides what Allocations is allowed to do.
 */
export function MatrixPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [importing, setImporting] = useState(false)
  const { data, isPending, isError, error, refetch } = useMatrix()

  const items = useMemo(() => data?.items ?? [], [data])
  const withMatrix = items.filter((c) => c.countries.length > 0)
  const totals = withMatrix.reduce(
    (acc, c) => ({
      countries: acc.countries + c.countries.length,
      taken: acc.taken + c.countries.filter((x) => x.delegateId).length,
    }),
    { countries: 0, taken: 0 },
  )

  return (
    <>
      <PageHeader
        title="Country matrix"
        description="Which countries sit in which committee. Once a committee has a matrix, only those countries can be allocated to it."
        actions={
          isAdmin ? (
            <Button onClick={() => setImporting(true)}>
              <Upload size={16} aria-hidden />
              Import CSV
            </Button>
          ) : null
        }
      />

      {isPending ? (
        <SkeletonCards count={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Globe2}
          title="No committees yet"
          description="A matrix belongs to a committee, so there is nothing to import against. Create the committees first."
          action={
            <Button asChild variant="secondary">
              <Link to="/committees">Go to Committees</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {withMatrix.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Committees with a matrix" value={`${withMatrix.length} of ${items.length}`} />
              <Stat label="Countries in total" value={totals.countries} />
              <Stat label="Allocated" value={`${totals.taken} of ${totals.countries}`} />
            </div>
          ) : null}

          {withMatrix.length === 0 ? (
            <p className="rounded-control border border-edge bg-surface-sunken p-3 text-body-sm text-ink-secondary">
              No matrix has been imported yet, so every committee still accepts any country typed into
              Allocations. Import one and that committee becomes constrained — the others are
              unaffected.
            </p>
          ) : null}

          {items.map((committee) => (
            <CommitteeMatrix key={committee.id} committee={committee} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      <MatrixImportDialog open={importing} onOpenChange={setImporting} />
    </>
  )
}
