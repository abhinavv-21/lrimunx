import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useToast } from '@/providers/ToastProvider'
import { useLedgerSummary, useSaveLedgerEntry } from '@/lib/hooks'
import { errorMessage } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { DEFAULT_CATEGORY, formatMoney } from './money'
import { categoryChoices } from './summary'
import type { LedgerEntry } from '@/types/api'

// The API stores a credit and a debit and refuses a line that carries both.
// Asking for a direction and one amount is the same thing said once, and it
// removes the only way a treasurer could file an unreconcilable row.
const DIRECTIONS: SelectOption[] = [
  { value: 'credit', label: 'Money in', hint: 'A sponsor cheque, a refund coming back' },
  { value: 'debit', label: 'Money out', hint: 'An invoice, a bill, a purchase' },
]

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** The stored timestamp back to the yyyy-mm-dd a date input can hold. */
function asDateInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

/**
 * A new entry with some of it already filled in.
 *
 * Used by the referrals page, which knows the category, the payee and the exact
 * figure and should not make a treasurer retype any of them. Deliberately a
 * draft and not a write: money leaves the conference when somebody presses
 * Save, not when a count crosses a threshold.
 */
export interface LedgerDraft {
  particular?: string
  category?: string
  amount?: number
  note?: string
  direction?: 'credit' | 'debit'
}

export function LedgerEntryDialog({
  open,
  onOpenChange,
  entry,
  draft,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: LedgerEntry | null
  /** Ignored when `entry` is set: editing an existing row wins over a suggestion. */
  draft?: LedgerDraft | null
}) {
  const [entryDate, setEntryDate] = useState(today())
  const [particular, setParticular] = useState('')
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY)
  const [direction, setDirection] = useState('debit')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useSaveLedgerEntry()
  const toast = useToast()

  // The categories already in the books, so a treasurer who invented one last
  // week picks it off the list instead of retyping it into a near-duplicate.
  const summary = useLedgerSummary()
  const categoryOptions = useMemo<SelectOption[]>(
    () => categoryChoices(summary.data).map((name) => ({ value: name, label: name })),
    [summary.data],
  )

  useEffect(() => {
    if (!open) return
    setEntryDate(entry ? asDateInput(entry.entryDate) : today())
    setParticular(entry?.particular ?? draft?.particular ?? '')
    setCategory(entry?.category ?? draft?.category ?? DEFAULT_CATEGORY)
    setDirection(entry ? (entry.credit > 0 ? 'credit' : 'debit') : (draft?.direction ?? 'debit'))
    setAmount(
      entry
        ? String(entry.credit > 0 ? entry.credit : entry.debit)
        : draft?.amount !== undefined
          ? String(draft.amount)
          : '',
    )
    setNote(entry?.note ?? draft?.note ?? '')
    setError(null)
  }, [open, entry, draft])

  const parsedAmount = Number(amount)
  const amountIsUsable = amount.trim() !== '' && Number.isInteger(parsedAmount) && parsedAmount > 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!amountIsUsable) {
      setError('Enter the amount as a whole number of rupees above zero.')
      return
    }

    const trimmedCategory = category.trim()
    if (trimmedCategory.length < 2 || trimmedCategory.length > 40) {
      setError('Name the category in 2 to 40 characters, like “Venue” or “Ambulance on standby”.')
      return
    }

    try {
      await save.mutateAsync({
        ...(entry ? { id: entry.id } : {}),
        entryDate,
        particular: particular.trim(),
        category: trimmedCategory,
        credit: direction === 'credit' ? parsedAmount : 0,
        debit: direction === 'debit' ? parsedAmount : 0,
        note: note.trim() === '' ? null : note.trim(),
      })
      toast.success(entry ? 'Entry updated' : 'Entry added', `${particular.trim()} — ${formatMoney(parsedAmount)}`)
      onOpenChange(false)
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save this entry.'))
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? 'Edit ledger entry' : 'New ledger entry'}
      description="One line of the closing statement. Date it when the money actually moved, not when you are typing it in."
      holdsInput
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error ? (
          <p role="alert" className="rounded-control border border-danger bg-danger-wash p-3 text-body-sm text-ink">
            {error}
          </p>
        ) : null}

        <Field label="Particular" hint="What the money was for, as it should read on the statement." required>
          {({ id }) => (
            <Input
              id={id}
              value={particular}
              onChange={(event) => setParticular(event.target.value)}
              placeholder="Hall booking — day one"
              maxLength={200}
              required
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            {({ id }) => (
              <Input
                id={id}
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
                required
              />
            )}
          </Field>

          <Field label="Category" hint="Pick one or type your own." required>
            {({ id }) => (
              <Select
                id={id}
                value={category}
                onChange={setCategory}
                options={categoryOptions}
                allowCustom
                placeholder="Venue, Ambulance on standby…"
              />
            )}
          </Field>

          <Field label="Direction" required>
            {({ id }) => (
              <Select id={id} value={direction} onChange={setDirection} options={DIRECTIONS} />
            )}
          </Field>

          <Field
            label="Amount"
            hint={amountIsUsable ? formatMoney(parsedAmount) : 'Whole rupees.'}
            required
          >
            {({ id }) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="45000"
                required
              />
            )}
          </Field>
        </div>

        <Field label="Note" hint="Optional. An invoice number, who authorised it, anything the particular cannot hold.">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {entry ? 'Save changes' : 'Add entry'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
