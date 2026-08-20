import { useState } from 'react'
import { AlertTriangle, Globe2, Plus, Trash2, Upload } from 'lucide-react'
import { useAddMatrixCountry, useMatrix, useRemoveMatrixCountry } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import { ApiError, errorMessage } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Field'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States'
import { CommitteeMatrixImportDialog } from './CommitteeMatrixImportDialog'
import { MatrixImportDialog } from './MatrixImportDialog'
import { cn } from '@/lib/utils'

export function CountryMatrixSection({
  committeeId,
  committeeCode,
  totalSeats,
  isAdmin,
}: {
  committeeId: string
  committeeCode: string
  totalSeats: number
  isAdmin: boolean
}) {
  const [adding, setAdding] = useState('')
  const [scopedImportOpen, setScopedImportOpen] = useState(false)
  const [sheetImportOpen, setSheetImportOpen] = useState(false)

  const { data, isPending, isError, error, refetch } = useMatrix()
  const add = useAddMatrixCountry()
  const remove = useRemoveMatrixCountry()
  const toast = useToast()

  const matrix = data?.items.find((item) => item.id === committeeId)
  const countries = matrix?.countries ?? []
  const offMatrix = matrix?.offMatrix ?? []

  const taken = countries.filter((country) => country.delegateId).length
  const open = countries.length - taken

  async function handleAdd() {
    const country = adding.trim()
    if (!country) return
    try {
      await add.mutateAsync({ committeeId, country })
      setAdding('')
      toast.success('Added to the matrix', `${country} — ${committeeCode}`)
    } catch (caught) {
      toast.error(errorMessage(caught, 'That could not be added.'))
    }
  }

  async function handleRemove(id: string, country: string) {
    try {
      await remove.mutateAsync(id)
      toast.success('Removed from the matrix', `${country} — ${committeeCode}`)
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'That could not be removed.')
    }
  }

  return (
    <Card>
      <CardHeader
        title="Country matrix"
        description={
          isPending || isError
            ? undefined
            : countries.length === 0
              ? `No matrix yet, so Allocations accepts any country typed against ${committeeCode}.`
              : `${countries.length} countries · ${open} open · ${taken} taken${
                  countries.length !== totalSeats ? ` · ${totalSeats} seats in the room` : ''
                }. Only these can be allocated here.`
        }
      />

      {isPending ? (
        <SkeletonRows rows={3} columns={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          {offMatrix.length > 0 ? (
            <p className="mb-3 flex items-start gap-2 rounded-control border border-warning bg-warning-wash p-2.5 text-body-sm text-ink">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              <span>
                Allocated to a country that is not on this matrix:{' '}
                {offMatrix.map((entry) => `${entry.country} (${entry.delegateName})`).join(', ')}. These
                were placed before the matrix existed — add the country here, or move the delegate.
              </span>
            </p>
          ) : null}

          {countries.length === 0 ? (
            <EmptyState
              icon={Globe2}
              title={`No matrix for ${committeeCode}`}
              description={
                isAdmin
                  ? `Add the countries one at a time below, or paste the whole list for ${committeeCode} with “Import this committee”. “Import the whole sheet” takes one CSV covering every room at once.`
                  : 'The secretariat has not fixed the countries for this room, so any country can be allocated to it.'
              }
            />
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {countries.map((country) => (
                <li key={country.id}>
                  <span
                    className={cn(
                      'inline-flex min-h-tap items-center gap-1.5 rounded-control border py-1 pl-2 text-body-sm md:min-h-10',
                      isAdmin && !country.delegateId ? 'pr-0' : 'pr-2',
                      country.delegateId
                        ? 'border-edge bg-surface-sunken text-ink-secondary'
                        : 'border-edge-strong text-ink',
                    )}
                  >
                    {country.country}
                    {country.delegateName ? (
                      <span className="text-ink-tertiary">— {country.delegateName}</span>
                    ) : null}

                    {isAdmin && !country.delegateId ? (
                      <button
                        type="button"
                        className="grid size-tap shrink-0 place-items-center rounded-control text-ink-tertiary transition-colors duration-micro hover:text-danger md:size-10"
                        aria-label={`Remove ${country.country} from ${committeeCode}`}
                        onClick={() => void handleRemove(country.id, country.country)}
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {isAdmin ? (
            <>
              <div className="mt-3 flex gap-2">
                <Input
                  value={adding}
                  onChange={(event) => setAdding(event.target.value)}
                  aria-label={`Add a country to ${committeeCode}`}
                  placeholder={`Add a country to ${committeeCode}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleAdd()
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  onClick={() => void handleAdd()}
                  disabled={!adding.trim()}
                  loading={add.isPending}
                  className="shrink-0"
                >
                  <Plus size={16} aria-hidden />
                  Add
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setScopedImportOpen(true)}>
                  <Upload size={16} aria-hidden />
                  Import this committee
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSheetImportOpen(true)}>
                  Import the whole sheet
                </Button>
              </div>
            </>
          ) : null}
        </>
      )}

      {isAdmin ? (
        <>
          <CommitteeMatrixImportDialog
            open={scopedImportOpen}
            onOpenChange={setScopedImportOpen}
            committeeCode={committeeCode}
          />
          <MatrixImportDialog open={sheetImportOpen} onOpenChange={setSheetImportOpen} />
        </>
      ) : null}
    </Card>
  )
}
