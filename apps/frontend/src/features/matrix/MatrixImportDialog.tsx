import { useState, type ChangeEvent } from 'react'
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { useImportMatrix } from '@/lib/hooks'
import { errorMessage } from '@/lib/api'
import type { MatrixImportResult } from '@/types/api'

/**
 * The shape the sheet is authored in: one column per committee, countries down
 * each. Columns of different lengths are expected — the gaps are not errors.
 */
const TEMPLATE = ['UNSC,DISEC,WHO', 'France,India,Brazil', 'China,Egypt,Kenya', 'United States,Japan,'].join('\n')

export function MatrixImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [csv, setCsv] = useState('')
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [result, setResult] = useState<MatrixImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importMatrix = useImportMatrix()

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
      setResult(await importMatrix.mutateAsync({ csv, mode }))
    } catch (caught) {
      setError(errorMessage(caught, 'The matrix could not be imported.'))
    }
  }

  function close(next: boolean) {
    if (!next) {
      setCsv('')
      setResult(null)
      setError(null)
      setMode('merge')
    }
    onOpenChange(next)
  }

  return (
    <Modal open={open} onOpenChange={close} title="Import the country matrix" holdsInput>
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-ink-secondary">
          One column per committee, countries listed down each. The heading must match a committee's
          code or its full name — importing never creates a committee, because it cannot know the
          seat count.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" asChild>
            <label className="cursor-pointer">
              <Upload size={16} aria-hidden />
              Choose a CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} />
            </label>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCsv(TEMPLATE)}>
            Paste an example
          </Button>
        </div>

        <Field label="CSV" hint="Paste the sheet, or load a file above.">
          {({ id }) => (
            <Textarea
              id={id}
              rows={8}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              placeholder={TEMPLATE}
              spellCheck={false}
              className="font-mono text-data"
            />
          )}
        </Field>

        <Field
          label="What to do with what is already there"
          hint={
            mode === 'merge'
              ? 'Adds anything new and leaves the rest alone. Nothing is removed.'
              : 'The sheet becomes the whole matrix for the committees it names. Committees it does not name are untouched.'
          }
        >
          {({ id }) => (
            <Select id={id} value={mode} onChange={(event) => setMode(event.target.value as 'merge' | 'replace')}>
              <option value="merge">Merge — add what is missing</option>
              <option value="replace">Replace — make the sheet authoritative</option>
            </Select>
          )}
        </Field>

        {error ? (
          <p role="alert" className="rounded-control border border-danger bg-danger-wash p-3 text-body-sm text-ink">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="flex flex-col gap-3 rounded-control border border-edge bg-surface-sunken p-3">
            <p className="flex items-center gap-2 text-body-sm text-ink">
              <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden />
              {result.added} added · {result.unchanged} already there · {result.removed} removed
              {result.committees.length > 0 ? ` — ${result.committees.join(', ')}` : ''}
            </p>

            {result.longForm ? (
              <p className="text-body-sm text-ink-secondary">
                Read as Committee/Country rows rather than one column per committee.
              </p>
            ) : null}

            {/* Countries `replace` wanted to drop but could not. Never silent:
                an operator who asked for authoritative needs to know where it
                did not get it, and why. */}
            {result.kept.length > 0 ? (
              <div>
                <p className="text-label uppercase text-ink-secondary">Kept — a delegate is sitting on them</p>
                <ul className="mt-1 flex flex-col gap-0.5 text-body-sm text-ink">
                  {result.kept.map((k) => (
                    <li key={`${k.committee}-${k.country}`}>
                      {k.committee} · {k.country} — {k.delegateName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.issues.length > 0 ? (
              <div>
                <p className="flex items-center gap-2 text-label uppercase text-ink-secondary">
                  <AlertTriangle size={14} className="shrink-0 text-warning" aria-hidden />
                  {result.issues.length} {result.issues.length === 1 ? 'issue' : 'issues'}
                </p>
                <ul className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto text-body-sm text-ink-secondary">
                  {result.issues.map((issue, index) => (
                    <li key={index}>
                      Row {issue.row}
                      {issue.column ? ` · ${issue.column}` : ''} — {issue.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          <Button onClick={() => void handleImport()} loading={importMatrix.isPending} disabled={!csv.trim()}>
            Import
          </Button>
        </div>
      </div>
    </Modal>
  )
}
