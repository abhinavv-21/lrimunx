import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useToast } from '@/providers/ToastProvider'
import { usePricing, useRecordPayment } from '@/lib/hooks'
import { errorMessage } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { PRICE_TIERS, TIER_LABELS, TIER_MEANING, formatMoney } from '@/features/budget/money'
import type { DelegatePayment, PriceTier } from '@/types/api'

/**
 * What recording a payment actually needs: the registration it is against, and
 * what it currently says.
 *
 * Both `Registration` and a delegate's `registration` satisfy this. The payment
 * belongs to the registration either way. POST /registrations/:id/payment is
 * the only thing that writes it, and PATCH /delegates/:id deliberately will not
 * accept the fields, so the delegate form and the registrations queue are two
 * doors onto one record rather than two records.
 */
export type Payable = Pick<DelegatePayment, 'id' | 'priceTier' | 'amountPaid'>

/**
 * The tier, the amount and the submit that records them. Its own form, so it
 * saves on its own: mounted in the delegate form it sits beside a second form
 * that saves the delegate, and pressing Enter in the amount box has to record a
 * payment rather than silently save the delegate's name.
 */
export function PaymentFields({
  payable,
  payerName,
  onRecorded,
  onCancel,
}: {
  payable: Payable
  /** Whose payment it is, for the toast. The delegate or registration supplies it. */
  payerName: string
  onRecorded?: () => void
  onCancel?: () => void
}) {
  const [tier, setTier] = useState<PriceTier>('BASE')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const prices = usePricing()
  const record = useRecordPayment()
  const toast = useToast()

  useEffect(() => {
    setTier(payable.priceTier ?? 'BASE')
    // Blank means "whatever the tier charges" — the API applies the rate when
    // no amount is sent, so the field never has to guess at a figure the
    // pricing query has not delivered yet.
    setAmount(payable.amountPaid === null ? '' : String(payable.amountPaid))
    setError(null)
    // The values, not the object. Inside a dialog these were the same thing, but
    // this now also mounts in the delegate form, which stays open: any unrelated
    // refetch of ['delegates'] hands back a new object with identical fields and
    // would wipe an amount someone was halfway through typing. Depending on the
    // fields still refreshes after a save, because those genuinely change.
  }, [payable.id, payable.priceTier, payable.amountPaid])

  const rates = prices.data
  const rate = rates?.[tier]

  const options = useMemo<SelectOption[]>(
    () =>
      PRICE_TIERS.map((value) => ({
        value,
        label: TIER_LABELS[value],
        hint: rates ? `${formatMoney(rates[value])} — ${TIER_MEANING[value]}` : TIER_MEANING[value],
      })),
    [rates],
  )

  const typed = amount.trim()
  const parsed = Number(typed)
  const typedIsUsable = typed !== '' && Number.isInteger(parsed) && parsed >= 0
  const difference = typedIsUsable && rate !== undefined ? parsed - rate : 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (typed !== '' && !typedIsUsable) {
      setError('Enter the amount as a whole number of rupees, or leave it blank to use the tier rate.')
      return
    }

    try {
      const saved = await record.mutateAsync({
        id: payable.id,
        priceTier: tier,
        ...(typedIsUsable ? { amountPaid: parsed } : {}),
      })
      toast.success(
        'Payment recorded',
        `${payerName} — ${TIER_LABELS[tier]}, ${formatMoney(saved.amountPaid)}`,
      )
      onRecorded?.()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not record this payment.'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <p role="alert" className="rounded-control border border-danger bg-danger-wash p-3 text-body-sm text-ink">
          {error}
        </p>
      ) : null}

      <Field label="Tier" required>
        {({ id }) => (
          <Select
            id={id}
            value={tier}
            onChange={(value) => {
              const next = value as PriceTier
              const previousRate = rates?.[tier]
              setTier(next)

              // Follow the tier unless the amount was deliberately something
              // else. Switching to Discount while the box still reads the Base
              // figure is a number nobody chose, and it goes straight into the
              // books. An amount that never matched the old rate was typed on
              // purpose, so leave it alone.
              const nextRate = rates?.[next]
              if (nextRate === undefined) return
              if (amount === '' || Number(amount) === previousRate) {
                setAmount(String(nextRate))
              }
            }}
            options={options}
          />
        )}
      </Field>

      <Field
        label="Amount received"
        hint={
          rate !== undefined
            ? `Leave it blank to record the ${TIER_LABELS[tier]} rate of ${formatMoney(rate)}.`
            : prices.isError
              ? 'The configured rates could not be fetched. Leave this blank and the server applies the tier rate anyway.'
              : 'Leave it blank to record the tier rate.'
        }
      >
        {({ id }) => (
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={rate === undefined ? 'Tier rate' : String(rate)}
          />
        )}
      </Field>

      {difference !== 0 ? (
        <p className="text-body-sm text-ink-secondary">
          {formatMoney(Math.abs(difference))} {difference < 0 ? 'under' : 'over'} the{' '}
          {TIER_LABELS[tier]} rate. Recorded as typed.
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={record.isPending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={record.isPending}>
          Record payment
        </Button>
      </div>
    </form>
  )
}
