import { useEffect, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { SaveIndicator, type SaveState } from '@/components/ui/SaveIndicator'
import { ApiError } from '@/lib/api'
import { useUpdateAward } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { AWARD_TITLES_LIST_ID } from './awards'
import type { Award, CommitteeSeat } from '@/types/api'

/**
 * One award, edited in place.
 *
 * Title is free text with suggestions, recipient is a dropdown of this
 * committee's seats. Neither opens a dialog — the ceremony list is short and
 * changes right up to the closing session, so a modal per edit is pure friction.
 */
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
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)

  const update = useUpdateAward(committeeId)

  // Re-sync when a refetch replaces the row, but never mid-save.
  useEffect(() => {
    if (state === 'saving') return
    setTitle(award.title)
    setDelegateId(award.delegate?.id ?? '')
    setNote(award.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [award.title, award.delegate?.id, award.note])

  const savedTitle = award.title
  const savedDelegateId = award.delegate?.id ?? ''
  const savedNote = award.note ?? ''

  async function save(next: { title?: string; delegateId?: string; note?: string }) {
    const nextTitle = (next.title ?? title).trim()
    const nextDelegateId = next.delegateId ?? delegateId
    const nextNote = (next.note ?? note).trim()

    if (nextTitle === '') {
      // An award with no title cannot be announced. Put the old one back
      // rather than saving a blank.
      setTitle(savedTitle)
      return
    }
    if (nextTitle === savedTitle && nextDelegateId === savedDelegateId && nextNote === savedNote) return

    setState('saving')
    setError(null)
    try {
      await update.mutateAsync({
        id: award.id,
        title: nextTitle,
        delegateId: nextDelegateId === '' ? null : nextDelegateId,
        note: nextNote === '' ? null : nextNote,
      })
      setState('saved')
      setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 1600)
    } catch (caught) {
      setState('error')
      setError(caught instanceof ApiError ? caught.message : 'Could not save this award.')
      // Back to the truth the server holds.
      setTitle(savedTitle)
      setDelegateId(savedDelegateId)
      setNote(savedNote)
    }
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
          disabled={state === 'saving'}
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
          disabled={state === 'saving'}
          onChange={(event) => {
            setDelegateId(event.target.value)
            void save({ delegateId: event.target.value })
          }}
        >
          <option value="">Not decided yet</option>
          {seats.map((seat) => (
            <option key={seat.delegate.id} value={seat.delegate.id}>
              {seat.delegate.fullName} — {seat.country}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-w-0">
        <label className="sr-only" htmlFor={`award-note-${award.id}`}>Note</label>
        <Input
          id={`award-note-${award.id}`}
          value={note}
          placeholder="Note (optional)"
          disabled={state === 'saving'}
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
          disabled={state === 'saving'}
          onClick={() => onDelete(award)}
        >
          <Trash2 size={16} aria-hidden />
        </Button>
      </div>
    </li>
  )
}
