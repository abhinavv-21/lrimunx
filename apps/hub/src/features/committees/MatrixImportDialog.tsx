import { useState, type ChangeEvent } from 'react'
import { Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Callout } from '@/components/ui/Callout'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { useImportMatrix } from '@/lib/hooks'
import { errorMessage } from '@/lib/api'
import { MatrixImportSummary } from './MatrixImportSummary'
import type { MatrixImportResult } from '@/types/api'

const TEMPLATE = ['UNSC,DISEC,WHO', 'France,India,Brazil', 'China,Egypt,Kenya', 'United States,Japan,'].join('\n')

export const IMPORT_MODES: SelectOption[] = [
  { value: 'merge', label: 'Merge', hint: 'Add what is missing, keep the rest' },
  { value: 'replace', label: 'Replace', hint: 'Make the sheet authoritative' },
]

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
            <label className="inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-control border border-edge-strong bg-surface px-4 text-body font-medium text-ink transition-colors duration-micro hover:bg-surface-sunken active:bg-edge focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-canvas md:min-h-10">
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
            <Select
              id={id}
              value={mode}
              onChange={(next) => setMode(next as 'merge' | 'replace')}
              options={IMPORT_MODES}
            />
          )}
        </Field>

        {error ? (
          <Callout tone="danger" alert>
            {error}
          </Callout>
        ) : null}

        {result ? <MatrixImportSummary result={result} /> : null}

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
