import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Callout } from '@/components/ui/Callout'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useImportMatrix } from '@/lib/hooks'
import { errorMessage } from '@/lib/api'
import { IMPORT_MODES } from './MatrixImportDialog'
import { MatrixImportSummary } from './MatrixImportSummary'
import { pastedCountries, scopedMatrixCsv } from './matrixCsv'
import type { MatrixImportResult } from '@/types/api'

/**
 * Importing the countries for the room you are looking at.
 *
 * It posts to the same /matrix/import as the whole-sheet dialog. The scoping is
 * the CSV itself: one column, headed with this committee's code, so the import
 * has nothing else it could reach.
 */
export function CommitteeMatrixImportDialog({
  open,
  onOpenChange,
  committeeCode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  committeeCode: string
}) {
  const [paste, setPaste] = useState('')
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [result, setResult] = useState<MatrixImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importMatrix = useImportMatrix()

  const countries = useMemo(() => pastedCountries(paste, committeeCode), [paste, committeeCode])

  async function handleImport() {
    setError(null)
    setResult(null)
    try {
      setResult(
        await importMatrix.mutateAsync({ csv: scopedMatrixCsv(committeeCode, countries), mode }),
      )
    } catch (caught) {
      setError(errorMessage(caught, `The countries for ${committeeCode} could not be imported.`))
    }
  }

  function close(next: boolean) {
    if (!next) {
      setPaste('')
      setResult(null)
      setError(null)
      setMode('merge')
    }
    onOpenChange(next)
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title={`Import countries into ${committeeCode}`}
      description={`Only ${committeeCode} is touched. Every other room keeps the matrix it has.`}
      holdsInput
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Countries"
          hint="One per line. A line with commas or tabs in it counts as several."
        >
          {({ id }) => (
            <Textarea
              id={id}
              rows={8}
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              placeholder={'France\nIndia\nBrazil'}
              spellCheck={false}
              className="font-mono text-data"
            />
          )}
        </Field>

        {/*
          Read back before anything is sent: it is the only way to see that a
          line with a comma in it was split the way you meant.
        */}
        <p className="text-body-sm text-ink-secondary" aria-live="polite">
          {countries.length === 0
            ? 'Nothing to import yet.'
            : countries.length === 1
              ? `One country read: ${countries[0]}.`
              : `${countries.length} countries read, ${countries[0]} down to ${countries[countries.length - 1]}.`}
        </p>

        <Field
          label="What to do with what is already there"
          hint={
            mode === 'merge'
              ? `Adds whatever ${committeeCode} is missing and leaves the rest alone. Nothing is removed.`
              : `This list becomes the whole matrix for ${committeeCode}. A country a delegate is already sitting on is kept, and named back to you.`
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
          <Button
            onClick={() => void handleImport()}
            loading={importMatrix.isPending}
            disabled={countries.length === 0}
          >
            Import
          </Button>
        </div>
      </div>
    </Modal>
  )
}
