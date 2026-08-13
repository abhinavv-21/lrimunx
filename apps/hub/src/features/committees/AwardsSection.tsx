import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/States'
import { ApiError, errorMessage } from '@/lib/api'
import { useCreateAward, useDeleteAward } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import { AwardRow } from './AwardRow'
import { AWARD_TITLES_LIST_ID, DEFAULT_AWARD_SET, STANDARD_AWARDS } from './awards'
import type { Award, CommitteeSeat } from '@/types/api'

export function AwardsSection({
  committeeId,
  committeeCode,
  awards,
  seats,
  isAdmin,
}: {
  committeeId: string
  committeeCode: string
  awards: Award[]
  seats: CommitteeSeat[]
  isAdmin: boolean
}) {
  const [newTitle, setNewTitle] = useState('')
  const [newDelegateId, setNewDelegateId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Award | null>(null)
  const [seeding, setSeeding] = useState(false)

  const recipients = useMemo<SelectOption[]>(
    () => [
      { value: '', label: 'Not decided yet' },
      ...seats.map((seat) => ({
        value: seat.delegate.id,
        label: seat.delegate.fullName,
        hint: seat.country,
      })),
    ],
    [seats],
  )

  const create = useCreateAward(committeeId)
  const remove = useDeleteAward(committeeId)
  const toast = useToast()

  const decided = awards.filter((award) => award.delegate !== null).length

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      await create.mutateAsync({
        title: newTitle.trim(),
        delegateId: newDelegateId === '' ? null : newDelegateId,
        note: null,
      })
      setNewTitle('')
      setNewDelegateId('')
    } catch (caught) {
      setError(errorMessage(caught, 'Could not add this award.'))
    }
  }

  async function seedStandardSet() {
    setSeeding(true)
    setError(null)
    try {
      for (const title of DEFAULT_AWARD_SET) {
        await create.mutateAsync({ title, delegateId: null, note: null })
      }
      toast.success('Standard awards added', `${DEFAULT_AWARD_SET.length} slots ready for ${committeeCode}`)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not add the standard set.')
    } finally {
      setSeeding(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await remove.mutateAsync(pendingDelete.id)
      toast.success('Award removed', pendingDelete.title)
      setPendingDelete(null)
    } catch (caught) {
      toast.error('Could not remove', caught instanceof ApiError ? caught.message : undefined)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Awards"
        description={
          awards.length === 0
            ? 'What this committee will award, and who wins it.'
            : `${decided} of ${awards.length} decided. Listed in the order they are announced.`
        }
      />

      <datalist id={AWARD_TITLES_LIST_ID}>
        {STANDARD_AWARDS.map((title) => (
          <option key={title} value={title} />
        ))}
      </datalist>

      {error ? (
        <Callout tone="danger" alert className="mb-4">
          {error}
        </Callout>
      ) : null}

      {awards.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No awards set up"
          description={
            isAdmin
              ? 'Add the standard set and fill in the winners as the committee decides them, or add your own.'
              : 'The secretariat has not set up this committee’s awards yet.'
          }
          action={
            isAdmin ? (
              <Button onClick={() => void seedStandardSet()} loading={seeding}>
                <Plus size={16} aria-hidden />
                Add the standard four
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden px-4 pb-2 md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_auto] md:gap-4">
            <span className="text-label uppercase text-ink-secondary">Award</span>
            <span className="text-label uppercase text-ink-secondary">Recipient</span>
            <span className="text-label uppercase text-ink-secondary">Note</span>
            <span className="md:w-28" />
          </div>

          {isAdmin ? (
            <ul className="flex flex-col gap-2">
              {awards.map((award) => (
                <AwardRow
                  key={award.id}
                  award={award}
                  committeeId={committeeId}
                  seats={seats}
                  onDelete={setPendingDelete}
                />
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-2">
              {awards.map((award) => (
                <li
                  key={award.id}
                  className="grid gap-1 rounded-card border border-edge bg-surface p-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1.2fr)] md:items-center md:gap-4 md:p-4"
                >
                  <p className="text-body font-medium text-ink">{award.title}</p>
                  {award.delegate ? (
                    <p className="min-w-0 truncate text-body text-ink">
                      {award.delegate.fullName}
                      <span className="text-ink-secondary"> — {award.delegate.schoolName}</span>
                    </p>
                  ) : (
                    <p className="text-body-sm text-ink-tertiary">Not decided yet</p>
                  )}
                  <p className="text-body-sm text-ink-secondary">{award.note ?? ''}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {isAdmin ? (
        <form
          onSubmit={(event) => void handleAdd(event)}
          className="mt-4 grid gap-3 border-t border-edge pt-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_auto] md:gap-4"
        >
          <div className="min-w-0">
            <label className="sr-only" htmlFor="new-award-title">New award title</label>
            <Input
              id="new-award-title"
              list={AWARD_TITLES_LIST_ID}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Add an award…"
              maxLength={80}
            />
          </div>

          <div className="min-w-0">
            <label className="sr-only" htmlFor="new-award-winner">Recipient</label>
            <Select
              id="new-award-winner"
              value={newDelegateId}
              onChange={setNewDelegateId}
              options={recipients}
              aria-label="Recipient of the new award"
            />
          </div>

          <Button type="submit" variant="secondary" loading={create.isPending && !seeding} disabled={newTitle.trim() === ''}>
            <Plus size={16} aria-hidden />
            Add
          </Button>
        </form>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Remove this award?"
        description={
          pendingDelete
            ? `Remove ${pendingDelete.title} from ${committeeCode}${
                pendingDelete.delegate ? `, currently awarded to ${pendingDelete.delegate.fullName}` : ''
              }? This cannot be undone.`
            : ''
        }
        onConfirm={() => void confirmDelete()}
        loading={remove.isPending}
      />
    </Card>
  )
}
