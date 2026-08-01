import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ApiError } from '@/lib/api'
import { useResetConference, useResetPreview } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import { pluralise } from '@/lib/utils'
import type { ResetCounts } from '@/types/api'

/** Reads in the order the conference is built, not the order rows are deleted. */
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

/**
 * Wiping the conference.
 *
 * Kept behind a passphrase as well as an ADMIN token, because a token is
 * something a signed-in browser already holds — on a shared registration desk
 * this needs to be a deliberate act, not a mis-click. The dialog names what is
 * about to be destroyed rather than asking anyone to trust a generic warning.
 */
export function DangerZone() {
  const [open, setOpen] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: preview, refetch } = useResetPreview()
  const reset = useResetConference()
  const toast = useToast()

  const items = preview ? summarise(preview.deleted) : []
  const nothingToClear = preview !== undefined && preview.total === 0
  const disabled = preview !== undefined && !preview.configured

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

          {items.length > 0 ? (
            <p className="mt-3 text-body-sm text-ink">
              Right now that would remove <strong className="font-medium">{items.join(', ')}</strong>.
            </p>
          ) : nothingToClear ? (
            <p className="mt-3 text-body-sm text-ink-secondary">
              There is nothing to clear — the conference is already empty.
            </p>
          ) : null}

          {disabled ? (
            <p className="mt-3 max-w-prose rounded-control border border-edge bg-surface-sunken p-3 text-body-sm text-ink-secondary">
              Clearing is switched off on this deployment. Set{' '}
              <code className="font-mono text-data">DANGER_RESET_PASSPHRASE</code> in the server
              environment to enable it.
            </p>
          ) : null}

          <div className="mt-4">
            <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled || nothingToClear}>
              <Trash2 size={16} aria-hidden />
              Clear everything
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={open}
        onOpenChange={close}
        title="Clear all conference data?"
        description={
          items.length > 0
            ? `This will permanently delete ${items.join(', ')}. Accounts and the audit log are kept.`
            : 'This will permanently delete every committee, delegate, allocation, registration, logistics request and award.'
        }
      >
        <div className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="rounded-control border border-danger bg-danger-wash p-3 text-body-sm text-ink">
              {error}
            </p>
          ) : null}

          <Field label="Passphrase" hint="Ask the secretariat if you do not have it.">
            {({ id }) => (
              <Input
                id={id}
                type="password"
                value={passphrase}
                autoComplete="off"
                autoFocus
                onChange={(event) => setPassphrase(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && passphrase !== '') {
                    event.preventDefault()
                    void handleReset()
                  }
                }}
              />
            )}
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => close(false)} disabled={reset.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleReset()}
              loading={reset.isPending}
              disabled={passphrase === ''}
            >
              <Trash2 size={16} aria-hidden />
              Delete everything
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
