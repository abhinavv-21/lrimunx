import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { CONFIRM_PHRASE, ConfirmDialog } from '@/components/ui/Modal'
import { ApiError, errorMessage } from '@/lib/api'
import { useResetConference, useResetPreview } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import { pluralise } from '@/lib/utils'
import type { ResetCounts } from '@/types/api'

const LABELS: Array<[keyof ResetCounts, string]> = [
  ['committees', 'committee'],
  ['delegates', 'delegate'],
  ['assignments', 'allocation'],
  ['registrations', 'registration'],
  ['logisticsRequests', 'logistics request'],
  ['awards', 'award'],
]

function summarise(counts: ResetCounts): string[] {
  return LABELS.filter(([key]) => counts[key] > 0).map(([key, noun]) => pluralise(counts[key], noun))
}

export function DangerZone() {
  const [open, setOpen] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)

  const {
    data: preview,
    isPending: previewPending,
    isError: previewFailed,
    error: previewError,
    refetch,
  } = useResetPreview()
  const reset = useResetConference()
  const toast = useToast()

  const items = preview ? summarise(preview.deleted) : []
  const nothingToClear = preview !== undefined && preview.total === 0
  const switchedOff = preview !== undefined && !preview.configured

  function close(nextOpen: boolean) {
    if (!nextOpen) {
      setPassphrase('')
      setError(null)
    }
    setOpen(nextOpen)
  }

  async function handleReset() {
    setError(null)
    try {
      const result = await reset.mutateAsync(passphrase)
      const cleared = summarise(result.deleted)
      toast.success(
        'Conference data cleared',
        cleared.length > 0 ? cleared.join(', ') : 'There was nothing left to remove.',
      )
      close(false)
      void refetch()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not clear the data.')
    }
  }

  return (
    <Card className="border-danger">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-h2 text-ink">Clear all conference data</h2>
          <p className="mt-1 max-w-prose text-body-sm text-ink-secondary">
            Removes every committee, delegate, allocation, registration, logistics request and award.
            Accounts are kept, so nobody is locked out, and the audit log keeps its record that this
            happened. There is no undo.
          </p>

          {previewPending ? (
            <p className="mt-3 text-body-sm text-ink-secondary" aria-live="polite">
              Counting what is in the conference…
            </p>
          ) : previewFailed ? (
            <div className="mt-3 max-w-prose">
              <Callout tone="danger" alert>
                <p>
                  Could not count what is in the conference right now, so clearing is held back:{' '}
                  {errorMessage(previewError, 'the server did not answer.')}
                </p>
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => void refetch()}>
                  Try again
                </Button>
              </Callout>
            </div>
          ) : items.length > 0 ? (
            <p className="mt-3 text-body-sm text-ink">
              Right now that would remove <strong className="font-medium">{items.join(', ')}</strong>.
            </p>
          ) : nothingToClear ? (
            <p className="mt-3 text-body-sm text-ink-secondary">
              There is nothing to clear — the conference is already empty.
            </p>
          ) : null}

          {switchedOff ? (
            <p className="mt-3 max-w-prose rounded-control border border-edge bg-surface-sunken p-3 text-body-sm text-ink-secondary">
              Clearing is switched off on this deployment. Set{' '}
              <code className="font-mono text-data">DANGER_RESET_PASSPHRASE</code> in the server
              environment to enable it.
            </p>
          ) : null}

          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() => setOpen(true)}
              disabled={previewPending || previewFailed || switchedOff || nothingToClear}
            >
              <Trash2 size={16} aria-hidden />
              Clear everything
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={close}
        title="Clear all conference data?"
        description={
          items.length > 0
            ? `This will permanently delete ${items.join(', ')}. Accounts and the audit log are kept.`
            : 'This will permanently delete every committee, delegate, allocation, registration, logistics request and award.'
        }
        confirmLabel="Delete everything"
        confirmPhrase={CONFIRM_PHRASE}
        confirmDisabled={passphrase === ''}
        loading={reset.isPending}
        onConfirm={() => void handleReset()}
      >
        {error ? (
          <Callout tone="danger" alert>
            {error}
          </Callout>
        ) : null}

        <Field label="Passphrase" hint="Ask the secretariat if you do not have it.">
          {({ id }) => (
            <Input
              id={id}
              type="password"
              value={passphrase}
              autoComplete="off"
              onChange={(event) => setPassphrase(event.target.value)}
            />
          )}
        </Field>
      </ConfirmDialog>
    </Card>
  )
}
