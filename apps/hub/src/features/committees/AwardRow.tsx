import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { SaveIndicator } from '@/components/ui/SaveIndicator'
import { useUpdateAward } from '@/lib/hooks'
import { useInlineSave } from '@/lib/useInlineSave'
import { cn } from '@/lib/utils'
import { AWARD_TITLES_LIST_ID } from './awards'
import type { Award, CommitteeSeat } from '@/types/api'

export function AwardRow({
  award,
  committeeId,
  seats,
  onDelete,
}: {
  award: Award
  committeeId: string
  seats: CommitteeSeat[]
  onDelete: (award: Award) => void
}) {
  const [title, setTitle] = useState(award.title)
  const [delegateId, setDelegateId] = useState(award.delegate?.id ?? '')
  const [note, setNote] = useState(award.note ?? '')

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

  const update = useUpdateAward(committeeId)

  const savedTitle = award.title
  const savedDelegateId = award.delegate?.id ?? ''
  const savedNote = award.note ?? ''

  const { state, error, saving, save: runSave } = useInlineSave('Could not save this award.', () => {
    setTitle(savedTitle)
    setDelegateId(savedDelegateId)
    setNote(savedNote)
  })

  useEffect(() => {
    if (saving) return
    setTitle(award.title)
    setDelegateId(award.delegate?.id ?? '')
    setNote(award.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [award.title, award.delegate?.id, award.note])

  async function save(next: { title?: string; delegateId?: string; note?: string }) {
    const nextTitle = (next.title ?? title).trim()
    const nextDelegateId = next.delegateId ?? delegateId
    const nextNote = (next.note ?? note).trim()

    if (nextTitle === '') {
      setTitle(savedTitle)
      return
    }
    if (nextTitle === savedTitle && nextDelegateId === savedDelegateId && nextNote === savedNote) return

    await runSave(() =>
      update.mutateAsync({
        id: award.id,
        title: nextTitle,
        delegateId: nextDelegateId === '' ? null : nextDelegateId,
        note: nextNote === '' ? null : nextNote,
      }),
    )
  }

  return (
    <li
      className={cn(
        'grid gap-3 rounded-card border bg-surface p-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_auto] md:items-center md:gap-4 md:p-4',
        state === 'error' ? 'border-danger' : 'border-edge',
      )}
    >
      <div className="min-w-0">
        <label className="sr-only" htmlFor={`award-title-${award.id}`}>Award title</label>
        <Input
          id={`award-title-${award.id}`}
          list={AWARD_TITLES_LIST_ID}
          value={title}
          disabled={saving}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => void save({})}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              setTitle(savedTitle)
              event.currentTarget.blur()
            }
          }}
        />
        {error ? (
          <p className="mt-1 flex items-start gap-1.5 text-body-sm text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>

      <div className="min-w-0">
        <label className="sr-only" htmlFor={`award-winner-${award.id}`}>Recipient</label>
        <Select
          id={`award-winner-${award.id}`}
          value={delegateId}
          disabled={saving}
          options={recipients}
          aria-label={`Recipient of ${award.title}`}
          onChange={(next) => {
            setDelegateId(next)
            void save({ delegateId: next })
          }}
        />
      </div>

      <div className="min-w-0">
        <label className="sr-only" htmlFor={`award-note-${award.id}`}>Note</label>
        <Input
          id={`award-note-${award.id}`}
          value={note}
          placeholder="Note (optional)"
          disabled={saving}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => void save({})}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              setNote(savedNote)
              event.currentTarget.blur()
            }
          }}
        />
      </div>

      <div className="flex items-center justify-end gap-1 md:w-28">
        <span aria-live="polite">
          <SaveIndicator state={state} />
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${award.title}`}
          disabled={saving}
          onClick={() => onDelete(award)}
        >
          <Trash2 size={16} aria-hidden />
        </Button>
      </div>
    </li>
  )
}
