import { useEffect, useId, useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Callout } from '@/components/ui/Callout'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useCommitteePlacementOptions, useCountryOptions } from '@/lib/selectOptions'
import { errorMessage } from '@/lib/api'
import { useCommittees, useCreateDelegate, useUpdateDelegate } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import { PaymentFields } from '@/features/registrations/PaymentFields'
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

  // The delegate fields and the payment fields are two forms saving to two
  // endpoints, so they cannot nest. The submit button lives outside its form
  // and points back at it by id.
  const formId = useId()

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

  const blankToCount = (value: string) => {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const payload: DelegateInput = {
      fullName: form.fullName.trim(),
      schoolName: form.schoolName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      grade: form.grade.trim(),
      committeePreference: delegate?.committeePreference ?? null,
      committeePreference2: delegate?.committeePreference2 ?? null,
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
      setError(errorMessage(caught, 'Could not save this delegate.'))
    }
  }

  const saving = create.isPending || update.isPending
  const noCommittees = (committees?.items.length ?? 0) === 0

  const selectedCommittee = committees?.items.find((c) => c.id === form.committeeId)

  const matrixCountries = selectedCommittee?.matrixCountries ?? []
  const committeeOptions = useCommitteePlacementOptions(
    committees?.items,
    delegate?.assignment?.committee.id ?? '',
    'Unplaced',
  )
  const { options: countryOptions, hasMatrix } = useCountryOptions(
    selectedCommittee,
    delegate?.id,
    form.country,
  )

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={delegate ? 'Edit delegate' : 'Add delegate'}
      description={delegate ? delegate.email : undefined}
      holdsInput
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error ? (
          <Callout tone="danger" alert>
            {error}
          </Callout>
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
                onChange={(next) => set('committeeId', next)}
                options={committeeOptions}
                disabled={noCommittees}
              />
            )}
          </Field>

          <Field
            label="Country"
            required={form.committeeId !== ''}
            hint={
              form.committeeId === ''
                ? 'Choose a committee first.'
                : matrixCountries.length > 0
                  ? `Must be one of ${selectedCommittee?.code}’s ${matrixCountries.length} matrix countries, and not already taken.`
                  : 'Must be unique within the committee.'
            }
          >
            {({ id }) => (
              <Select
                id={id}
                value={form.country}
                onChange={(next) => set('country', next)}
                options={countryOptions}

                allowCustom={!hasMatrix}
                searchable
                disabled={form.committeeId === ''}
                placeholder={form.committeeId === '' ? 'Pick a committee first' : 'Country'}
                emptyMessage={
                  hasMatrix ? `Not on ${selectedCommittee?.code ?? 'this committee'}'s matrix` : undefined
                }
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
      </form>

      {/*
        The payment lives on the registration, not the delegate: PATCH
        /delegates/:id will not accept it, and POST /registrations/:id/payment
        is what writes it. So this is a second form saving to a second endpoint,
        sitting outside the delegate form rather than inside it.
      */}
      <section className="mt-6 border-t border-edge pt-5">
        <h3 className="text-label uppercase text-ink-secondary">Payment</h3>

        {delegate?.registration ? (
          <>
            <p className="mt-1 max-w-prose text-body-sm text-ink-secondary">
              Against registration {delegate.registration.reference}. Recording it saves on its own,
              straight away, and feeds the budget. The rest of this form still needs saving separately.
            </p>
            <div className="mt-4">
              <PaymentFields payable={delegate.registration} payerName={delegate.fullName} />
            </div>
          </>
        ) : (
          <p className="mt-1 max-w-prose text-body-sm text-ink-secondary">
            {delegate
              ? 'This delegate was added by hand rather than through a registration, so there is no charge to record against them.'
              : 'A payment is recorded against the registration a delegate came in through. One added here has none, so there is nothing to charge.'}
          </p>
        )}
      </section>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form={formId} loading={saving}>
          {delegate ? 'Save changes' : 'Add delegate'}
        </Button>
      </div>
    </Modal>
  )
}
