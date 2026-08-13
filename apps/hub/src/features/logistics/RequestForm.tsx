import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Callout } from '@/components/ui/Callout'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useCommitteeFilterOptions } from '@/lib/selectOptions'
import { useCommittees } from '@/lib/hooks'
import { ApiError, apiFetch, errorMessage } from '@/lib/api'
import { useOffline } from '@/providers/OfflineProvider'
import { useToast } from '@/providers/ToastProvider'
import type { LogisticsRequest, RequestCategory } from '@/types/api'

const CATEGORIES: Array<{ value: RequestCategory; label: string }> = [
  { value: 'PLACARD', label: 'Placard' },
  { value: 'STATIONERY', label: 'Stationery' },
  { value: 'AWARDS', label: 'Awards' },
  { value: 'LOGISTICS', label: 'Logistics' },
]

export function RequestForm({
  open,
  onOpenChange,
  committee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  committee?: { id: string; code: string } | undefined
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<RequestCategory>('PLACARD')
  const [committeeId, setCommitteeId] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: committees } = useCommittees()

  const committeeOptions = useCommitteeFilterOptions(committees?.items, 'General')
  const { isOnline, queue } = useOffline()
  const toast = useToast()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (open) {
      setTitle('')
      setCategory('PLACARD')
      setCommitteeId(committee?.id ?? '')
      setDescription('')
      setError(null)
    }
  }, [open, committee])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = {
      title: title.trim(),
      category,
      description: description.trim(),
      committeeId: committeeId === '' ? null : committeeId,
    }

    if (!isOnline) {
      const pending = await queue({ kind: 'logistics', ...payload })
      toast.notify({
        tone: 'info',
        title: 'Saved on this device',
        description: `You are offline. This request will be sent automatically — ${pending} waiting.`,
      })
      setSubmitting(false)
      onOpenChange(false)
      return
    }

    try {
      const created = await apiFetch<LogisticsRequest>('/logistics-requests', { method: 'POST', body: payload })
      await queryClient.invalidateQueries({ queryKey: ['logistics'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })

      await queryClient.invalidateQueries({ queryKey: ['committees'] })

      toast.success(
        created.deduplicated ? 'Already raised' : 'Request raised',
        created.deduplicated ? 'An identical request was submitted moments ago.' : created.title,
      )
      onOpenChange(false)
    } catch (caught) {
      if (caught instanceof ApiError && caught.isOffline) {
        const pending = await queue({ kind: 'logistics', ...payload })
        toast.notify({
          tone: 'info',
          title: 'Saved on this device',
          description: `The connection dropped. This request will be sent automatically — ${pending} waiting.`,
        })
        onOpenChange(false)
      } else {
        setError(errorMessage(caught, 'Could not raise this request.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Raise a request"
      description="Tell the desk what a committee needs. Anything urgent alerts the secretariat immediately."
      holdsInput
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {!isOnline ? (
          <Callout tone="warning">
            You are offline. This will be saved on your device and sent as soon as you reconnect.
          </Callout>
        ) : null}

        {error ? (
          <Callout tone="danger" alert>
            {error}
          </Callout>
        ) : null}

        <Field label="What is needed" required>
          {({ id }) => (
            <Input
              id={id}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Placards missing for three UNSC delegations"
              required
              maxLength={160}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required>
            {({ id }) => (
              <Select
                id={id}
                value={category}
                onChange={(next) => setCategory(next as RequestCategory)}
                options={CATEGORIES}
              />
            )}
          </Field>

          {committee ? (
            <Field label="Committee" hint="Set by the page you raised this from.">
              {({ id }) => (
                <p
                  id={id}
                  className="flex min-h-tap items-center rounded-control border border-edge bg-surface-sunken px-3 font-mono text-data font-medium text-ink md:min-h-10"
                >
                  {committee.code}
                </p>
              )}
            </Field>
          ) : (
            <Field label="Committee" hint="Leave as General if it is not room-specific.">
              {({ id }) => (
                <Select
                  id={id}
                  value={committeeId}
                  onChange={setCommitteeId}
                  options={committeeOptions}
                />
              )}
            </Field>
          )}
        </div>

        <Field label="Details" hint="Where it is needed and by when." required>
          {({ id }) => (
            <Textarea
              id={id}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="France, Brazil and the United Kingdom placards are not in the room. Committee starts at 09:30."
              required
              maxLength={2000}
            />
          )}
        </Field>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={title.trim() === '' || description.trim() === ''}>
            {isOnline ? 'Raise request' : 'Save for later'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
