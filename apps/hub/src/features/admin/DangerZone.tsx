import { useState } from 'react'
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { CONFIRM_PHRASE, ConfirmDialog } from '@/components/ui/Modal'
import { errorMessage } from '@/lib/api'
import { useResetConference, useResetPreview, useRestartConference } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import { pluralise } from '@/lib/utils'
import type { PlaceholderCounts, ResetCounts } from '@/types/api'

const LABELS: Array<[keyof ResetCounts, string]> = [
  ['committees', 'committee'],
  ['delegates', 'delegate'],
  ['assignments', 'allocation'],
  ['registrations', 'registration'],
  ['logisticsRequests', 'logistics request'],
  ['awards', 'award'],
]

function summarise(counts: Partial<ResetCounts>): string[] {
  return LABELS.filter(([key]) => (counts[key] ?? 0) > 0).map(([key, noun]) =>
    pluralise(counts[key] ?? 0, noun),
  )
}

function summariseSeed(seeded: PlaceholderCounts): string {
  return [
    pluralise(seeded.registrations, 'registration'),
    pluralise(seeded.delegates, 'delegate'),
    pluralise(seeded.assignments, 'allocation'),
    pluralise(seeded.logisticsRequests, 'logistics request'),
  ].join(', ')
}

type DangerAction = 'reset' | 'restart'

export function DangerZone() {
  const [open, setOpen] = useState<DangerAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    data: preview,
    isPending: previewPending,
    isError: previewFailed,
    error: previewError,
    refetch,
  } = useResetPreview()
  const reset = useResetConference()
  const restart = useRestartConference()
  const toast = useToast()

  const items = preview ? summarise(preview.deleted) : []
  const nothingToClear = preview !== undefined && preview.total === 0
  const noCommittees = preview !== undefined && preview.deleted.committees === 0
  const switchedOff = preview !== undefined && !preview.configured
  const held = previewPending || previewFailed || switchedOff

  function close(nextOpen: boolean) {
    if (nextOpen) return
    setError(null)
    setOpen(null)
  }

  async function handleReset() {
    setError(null)
    try {
      const result = await reset.mutateAsync(CONFIRM_PHRASE)
      const cleared = summarise(result.deleted)
      toast.success(
        'Conference data cleared',
        cleared.length > 0 ? cleared.join(', ') : 'There was nothing left to remove.',
      )
      close(false)
      void refetch()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not clear the data.'))
    }
  }

  async function handleRestart() {
    setError(null)
    try {
      const result = await restart.mutateAsync(CONFIRM_PHRASE)
      toast.success('Conference restarted', `Seeded ${summariseSeed(result.seeded)}.`)
      close(false)
      void refetch()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not restart the conference.'))
    }
  }

  return (
    <Card className="border-danger">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-h2 text-ink">Danger zone</h2>
          <p className="mt-1 max-w-prose text-body-sm text-ink-secondary">
            Both of these empty the conference and neither can be undone. Accounts are kept, so
            nobody is locked out, and the audit log keeps its record that it happened.
          </p>

          {previewPending ? (
            <p className="mt-3 text-body-sm text-ink-secondary" aria-live="polite">
              Counting what is in the conference…
            </p>
          ) : previewFailed ? (
            <div className="mt-3 max-w-prose">
              <Callout tone="danger" alert>
                <p>
                  Could not count what is in the conference right now, so both actions are held
                  back: {errorMessage(previewError, 'the server did not answer.')}
                </p>
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => void refetch()}>
                  Try again
                </Button>
              </Callout>
            </div>
          ) : items.length > 0 ? (
            <p className="mt-3 text-body-sm text-ink">
              The conference currently holds{' '}
              <strong className="font-medium">{items.join(', ')}</strong>.
            </p>
          ) : (
            <p className="mt-3 text-body-sm text-ink-secondary">
              The conference is empty, so there is nothing in it to remove.
            </p>
          )}

          {switchedOff ? (
            <p className="mt-3 max-w-prose rounded-control border border-edge bg-surface-sunken p-3 text-body-sm text-ink-secondary">
              Both actions are switched off on this deployment. Set{' '}
              <code className="font-mono text-data">DANGER_RESET_PASSPHRASE</code> in the API
              environment and restart it to enable them.
            </p>
          ) : null}

          <ul className="mt-5 flex flex-col divide-y divide-edge border-t border-edge">
            <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 max-w-prose">
                <h3 className="text-h3 text-ink">Clear all conference data</h3>
                <p className="mt-1 text-body-sm text-ink-secondary">
                  Removes every committee, delegate, allocation, registration, logistics request and
                  award, and puts nothing back. The committees have to be recreated afterwards.
                </p>
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => setOpen('reset')}
                disabled={held || nothingToClear}
              >
                <Trash2 size={16} aria-hidden />
                Clear everything
              </Button>
            </li>

            <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 max-w-prose">
                <h3 className="text-h3 text-ink">Restart the conference</h3>
                <p className="mt-1 text-body-sm text-ink-secondary">
                  Clears the same records but keeps the committees and their country matrices, then
                  seats about twenty placeholder delegates so the hub has something in it to
                  practise on. For rehearsal before the conference opens, never during it.
                </p>
                {noCommittees && !switchedOff ? (
                  <p className="mt-2 text-body-sm text-ink-secondary">
                    There are no committees to seat anyone in. Create them first.
                  </p>
                ) : null}
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => setOpen('restart')}
                disabled={held || noCommittees}
              >
                <RotateCcw size={16} aria-hidden />
                Restart with test data
              </Button>
            </li>
          </ul>
        </div>
      </div>

      <ConfirmDialog
        open={open === 'reset'}
        onOpenChange={close}
        title="Clear all conference data?"
        description={
          items.length > 0
            ? `This permanently deletes ${items.join(', ')}. Accounts and the audit log are kept.`
            : 'This permanently deletes every committee, delegate, allocation, registration, logistics request and award.'
        }
        confirmLabel="Delete everything"
        confirmPhrase={CONFIRM_PHRASE}
        loading={reset.isPending}
        onConfirm={() => void handleReset()}
      >
        {error ? (
          <Callout tone="danger" alert>
            {error}
          </Callout>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={open === 'restart'}
        onOpenChange={close}
        title="Restart the conference?"
        description={`This permanently deletes every delegate, allocation, registration, logistics request and award, then seeds placeholder records in their place. The ${pluralise(preview?.deleted.committees ?? 0, 'committee')} and the country matrices stay as they are.`}
        confirmLabel="Restart the conference"
        confirmPhrase={CONFIRM_PHRASE}
        loading={restart.isPending}
        onConfirm={() => void handleRestart()}
      >
        {error ? (
          <Callout tone="danger" alert>
            {error}
          </Callout>
        ) : null}
      </ConfirmDialog>
    </Card>
  )
}
