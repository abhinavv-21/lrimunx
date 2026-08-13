import { useState, type ChangeEvent } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Callout } from '@/components/ui/Callout'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Field'
import { useCsvImport } from '@/lib/hooks'
import { errorMessage } from '@/lib/api'
import type { IngestResult } from '@/types/api'

const REQUIRED_COLUMNS = ['Full Name', 'School', 'Phone', 'Email', 'Grade']
const OPTIONAL_COLUMNS = ['Committee Preference', 'Dietary Notes', 'Accessibility Notes']

const TEMPLATE = [
  [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].join(','),
  'Aarav Menon,Ridge International School,+91 98200 41773,aarav@example.edu.in,11,UNSC,Vegetarian,',
].join('\n')

export function CsvImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [csv, setCsv] = useState('')
  const [upsert, setUpsert] = useState(true)
  const [result, setResult] = useState<IngestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importCsv = useCsvImport()

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => setCsv(String(reader.result ?? ''))
    reader.onerror = () => setError('That file could not be read.')
    reader.readAsText(file)
  }

  async function handleImport() {
    setError(null)
    setResult(null)
    try {
      setResult(await importCsv.mutateAsync({ csv, upsert }))
    } catch (caught) {
      setError(errorMessage(caught, 'The import failed.'))
    }
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setCsv('')
      setResult(null)
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title="Import delegates"
      description="Paste a CSV or choose a file exported from the registration sheet."
      holdsInput
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Callout tone="danger" alert>
            {error}
          </Callout>
        ) : null}

        {result ? (
          <div className="rounded-card border border-edge bg-surface-sunken p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-success" aria-hidden />
              <p className="text-h3 text-ink">Import finished</p>
            </div>
            <ul className="mt-3 grid grid-cols-3 gap-3">
              {[
                { label: 'Created', value: result.created },
                { label: 'Updated', value: result.updated },
                { label: 'Skipped', value: result.skipped },
              ].map((stat) => (
                <li key={stat.label}>
                  <p className="text-label uppercase text-ink-secondary">{stat.label}</p>
                  <p className="font-heading text-h2 tabular-nums text-ink">{stat.value}</p>
                </li>
              ))}
            </ul>

            {result.issues.length > 0 ? (
              <div className="mt-4">
                <p className="flex items-center gap-1.5 text-label uppercase text-warning">
                  <AlertTriangle size={14} aria-hidden />
                  {result.issues.length} rows need attention
                </p>
                <ul className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                  {result.issues.map((issue, index) => (
                    <li key={`${issue.row}-${index}`} className="text-body-sm text-ink-secondary">
                      <span className="font-mono text-data">Row {issue.row}</span> — {issue.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.phoneCollisions.length > 0 ? (
              <div className="mt-4">
                <p className="text-label uppercase text-ink-secondary">Shared phone numbers</p>
                <p className="mt-1 text-body-sm text-ink-secondary">
                  These numbers are used by more than one delegate. That is allowed — siblings and
                  teachers often register together — but worth a check.
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {result.phoneCollisions.map((collision) => (
                    <li key={collision.phone} className="font-mono text-data text-ink-secondary">
                      {collision.phone} — {collision.emails.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor="csv-file"
                className="inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-control border border-edge-strong bg-surface px-4 text-body font-medium text-ink transition-colors duration-micro hover:bg-surface-sunken md:min-h-10"
              >
                <Upload size={16} aria-hidden />
                Choose CSV file
              </label>
              <input id="csv-file" type="file" accept=".csv,text/csv" onChange={handleFile} className="sr-only" />
            </div>

            <div className="rounded-control border border-edge bg-surface-sunken p-3">
              <p className="text-label uppercase text-ink-secondary">Required columns</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {REQUIRED_COLUMNS.map((column) => (
                  <span
                    key={column}
                    className="rounded-pill border border-edge-strong bg-surface px-2.5 py-1 font-mono text-data text-ink"
                  >
                    {column}
                  </span>
                ))}
              </div>

              <p className="mt-3 text-label uppercase text-ink-secondary">Optional</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {OPTIONAL_COLUMNS.map((column) => (
                  <span
                    key={column}
                    className="rounded-pill border border-edge bg-surface px-2.5 py-1 font-mono text-data text-ink-secondary"
                  >
                    {column}
                  </span>
                ))}
              </div>

              <p className="mt-2.5 text-body-sm text-ink-secondary">
                Common header spellings are matched automatically and any other columns are ignored.
                Committee and country are <strong className="font-medium text-ink">not</strong> imported —
                a preference is what the delegate asked for, the placement is yours to make in Allocations.
                A column your sheet leaves out is left alone rather than blanked.
              </p>

              <Button
                variant="ghost"
                size="sm"
                className="mt-2 px-0"
                onClick={() => {
                  setCsv(TEMPLATE)
                  setError(null)
                }}
              >
                <FileSpreadsheet size={16} aria-hidden />
                Use a template row
              </Button>
            </div>

            <Field label="CSV content" required>
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={8}
                  value={csv}
                  onChange={(event) => setCsv(event.target.value)}
                  className="font-mono text-data"
                  placeholder={REQUIRED_COLUMNS.join(', ')}
                />
              )}
            </Field>

            <label className="flex min-h-tap items-center gap-3 text-body-sm text-ink md:min-h-10">
              <input
                type="checkbox"
                checked={upsert}
                onChange={(event) => setUpsert(event.target.checked)}
                className="size-4 rounded-control accent-accent"
              />
              Update delegates that already exist (matched by email)
            </label>
          </>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => handleClose(false)}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {!result ? (
            <Button onClick={() => void handleImport()} loading={importCsv.isPending} disabled={csv.trim() === ''}>
              Import
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
