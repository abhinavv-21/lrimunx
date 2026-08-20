import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useToast } from '@/providers/ToastProvider'
import { usePricing, useRecordPayment } from '@/lib/hooks'
import { errorMessage } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { PRICE_TIERS, TIER_LABELS, TIER_MEANING, formatMoney } from '@/features/budget/money'
import type { PriceTier, Registration } from '@/types/api'

export function PaymentDialog({
  registration,
  onOpenChange,
}: {
  registration: Registration | null
  onOpenChange: (open: boolean) => void
}) {
  const [tier, setTier] = useState<PriceTier>('BASE')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const prices = usePricing()
  const record = useRecordPayment()
  const toast = useToast()

  useEffect(() => {
    if (registration === null) return
    setTier(registration.priceTier ?? 'BASE')
    // Blank means "whatever the tier charges" — the API applies the rate when
    // no amount is sent, so the field never has to guess at a figure the
    // pricing query has not delivered yet.
    setAmount(registration.amountPaid === null ? '' : String(registration.amountPaid))
    setError(null)
  }, [registration])

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
    if (!registration) return
    setError(null)

    if (typed !== '' && !typedIsUsable) {
      setError('Enter the amount as a whole number of rupees, or leave it blank to use the tier rate.')
      return
    }

    try {
      const saved = await record.mutateAsync({
        id: registration.id,
        priceTier: tier,
        ...(typedIsUsable ? { amountPaid: parsed } : {}),
      })
      toast.success(
        'Payment recorded',
        `${registration.fullName} — ${TIER_LABELS[tier]}, ${formatMoney(saved.amountPaid)}`,
      )
      onOpenChange(false)
    } catch (caught) {
      setError(errorMessage(caught, 'Could not record this payment.'))
    }
  }

  return (
    <Modal
      open={registration !== null}
      onOpenChange={onOpenChange}
      title={registration?.amountPaid === null ? 'Record a payment' : 'Update the payment'}
      description={
        registration
          ? `What ${registration.fullName} was charged, and what actually arrived. It feeds the budget straight away.`
          : ''
      }
      holdsInput
    >
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
              onChange={(value) => setTier(value as PriceTier)}
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
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={record.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={record.isPending}>
            Record payment
          </Button>
        </div>
      </form>
    </Modal>
  )
}
