import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { ApiError } from '@/lib/api'
import { useCommittees, useCreateDelegate, useUpdateDelegate } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import type { Delegate, DelegateInput } from '@/types/api'

type FormState = {
  fullName: string
  schoolName: string
  phone: string
  email: string
  grade: string
  munsAttended: string
  awardsWon: string
  committeeId: string
  country: string
  dietaryNotes: string
  accessibilityNotes: string
}

const BLANK: FormState = {
  fullName: '', schoolName: '', phone: '', email: '', grade: '',
  munsAttended: '', awardsWon: '',
  committeeId: '', country: '',
  dietaryNotes: '', accessibilityNotes: '',
}

function toFormState(delegate: Delegate): FormState {
  return {
    fullName: delegate.fullName,
    schoolName: delegate.schoolName,
    phone: delegate.phone,
    email: delegate.email,
    grade: delegate.grade,
    // Empty string, not "0" — a delegate who never answered must not be shown
    // as having answered zero. The two mean different things to an allocator.
    munsAttended: delegate.munsAttended === null ? '' : String(delegate.munsAttended),
    awardsWon: delegate.awardsWon === null ? '' : String(delegate.awardsWon),
    committeeId: delegate.assignment?.committee.id ?? '',
    country: delegate.assignment?.country ?? '',
    dietaryNotes: delegate.dietaryNotes ?? '',
    accessibilityNotes: delegate.accessibilityNotes ?? '',
  }
}

export function DelegateForm({
  open,
  onOpenChange,
  delegate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  delegate: Delegate | null
}) {
  const [form, setForm] = useState<FormState>(BLANK)
  const [error, setError] = useState<string | null>(null)

  const create = useCreateDelegate()
  const update = useUpdateDelegate()
  const { data: committees } = useCommittees()
  const toast = useToast()

  useEffect(() => {
    if (open) {
      setForm(delegate ? toFormState(delegate) : BLANK)
      setError(null)
    }
  }, [open, delegate])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const blankToNull = (value: string) => (value.trim() === '' ? null : value.trim())

  /** Unanswered stays null; anything else goes as a number for the server to check. */
  const blankToCount = (value: string) => {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    // Clearing the committee also clears the country — an unplaced delegate
    // cannot hold one.
    const payload: DelegateInput = {
      fullName: form.fullName.trim(),
      schoolName: form.schoolName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      grade: form.grade.trim(),
      // Preferences are the applicant's own answer and are not ours to edit;
      // passed through unchanged so saving a delegate never silently discards
      // what they asked for.
      committeePreference: delegate?.committeePreference ?? null,
      committeePreference2: delegate?.committeePreference2 ?? null,
      // Experience IS editable. It arrives filled in from a public
      // registration, but a delegate added by hand here has no other way to
      // get it — and until this existed, every such delegate was permanently
      // blank in Allocations with no way to correct it.
      munsAttended: blankToCount(form.munsAttended),
      awardsWon: blankToCount(form.awardsWon),
      committeeId: form.committeeId === '' ? null : form.committeeId,
      country: form.committeeId === '' ? null : blankToNull(form.country),
      dietaryNotes: blankToNull(form.dietaryNotes),
      accessibilityNotes: blankToNull(form.accessibilityNotes),
    }

    try {
      if (delegate) {
        await update.mutateAsync({ id: delegate.id, ...payload })
        toast.success('Delegate updated', payload.fullName)
      } else {
        await create.mutateAsync(payload)
        toast.success('Delegate added', payload.fullName)
      }
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save this delegate.')
    }
  }

  const saving = create.isPending || update.isPending
  const noCommittees = (committees?.items.length ?? 0) === 0

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={delegate ? 'Edit delegate' : 'Add delegate'}
      description={delegate ? delegate.email : undefined}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error ? (
          <p role="alert" className="rounded-control border border-danger bg-danger-wash p-3 text-body-sm text-ink">
            {error}
          </p>
        ) : null}

        <Field label="Full name" required>
          {({ id }) => (
            <Input id={id} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required autoFocus />
          )}
        </Field>

        <Field label="School" required>
          {({ id }) => (
            <Input id={id} value={form.schoolName} onChange={(e) => set('schoolName', e.target.value)} required />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact number" required>
            {({ id }) => (
              <Input id={id} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} required />
            )}
          </Field>
          <Field label="Academic level" required>
            {({ id }) => <Input id={id} value={form.grade} onChange={(e) => set('grade', e.target.value)} required />}
          </Field>
        </div>

        {/* Shown to the allocator on every row. Left blank it reads "not
            stated" there, which is a different fact from "0 MUNs". */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="MUNs attended" hint="Conferences before this one. Leave blank if unknown.">
            {({ id }) => (
              <Input
                id={id}
                inputMode="numeric"
                value={form.munsAttended}
                onChange={(e) => set('munsAttended', e.target.value)}
                placeholder="—"
              />
            )}
          </Field>
          <Field label="Awards won" hint="Anything gavelled at those conferences.">
            {({ id }) => (
              <Input
                id={id}
                inputMode="numeric"
                value={form.awardsWon}
                onChange={(e) => set('awardsWon', e.target.value)}
                placeholder="—"
              />
            )}
          </Field>
        </div>

        <Field label="Email" required>
          {({ id }) => (
            <Input
              id={id}
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              required
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Committee"
            hint={noCommittees ? 'Create a committee first to place delegates.' : 'Leave unplaced until you assign them.'}
          >
            {({ id }) => (
              <Select
                id={id}
                value={form.committeeId}
                onChange={(e) => set('committeeId', e.target.value)}
                disabled={noCommittees}
              >
                <option value="">Unplaced</option>
                {committees?.items.map((committee) => (
                  <option
                    key={committee.id}
                    value={committee.id}
                    disabled={committee.seatsRemaining <= 0 && committee.id !== delegate?.assignment?.committee.id}
                  >
                    {committee.code} — {committee.seatsRemaining} of {committee.totalSeats} open
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Country"
            required={form.committeeId !== ''}
            hint={form.committeeId === '' ? 'Choose a committee first.' : 'Must be unique within the committee.'}
          >
            {({ id }) => (
              <Input
                id={id}
                value={form.country}
                onChange={(e) => set('country', e.target.value)}
                placeholder="France"
                disabled={form.committeeId === ''}
                required={form.committeeId !== ''}
              />
            )}
          </Field>
        </div>


        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dietary notes">
            {({ id }) => (
              <Textarea id={id} rows={2} value={form.dietaryNotes} onChange={(e) => set('dietaryNotes', e.target.value)} />
            )}
          </Field>
          <Field label="Accessibility notes">
            {({ id }) => (
              <Textarea
                id={id}
                rows={2}
                value={form.accessibilityNotes}
                onChange={(e) => set('accessibilityNotes', e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {delegate ? 'Save changes' : 'Add delegate'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
