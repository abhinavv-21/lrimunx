import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { ErrorState, SkeletonRows } from '@/components/ui/States'
import { errorMessage } from '@/lib/api'
import { usePricing, useSavePricing } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import type { PriceTier, TierPrices } from '@/types/api'

/** The server takes whole rupees between 0 and 100,000 (MAX_TIER_PRICE). */
const MAX_PRICE = 100_000

const TIERS: Array<{ tier: PriceTier; label: string; hint: string }> = [
  { tier: 'BASE', label: 'Standard', hint: 'A delegate from any other school.' },
  { tier: 'INTERNAL', label: 'LRI student', hint: "LRI's own students." },
  { tier: 'ALUMNI', label: 'Alumni', hint: 'Someone who has been a delegate at an earlier LRI MUN.' },
  {
    tier: 'DISCOUNT',
    label: 'Discounted',
    hint: 'One flat rate for every concession you grant, whatever the reason.',
  },
]

type PricingForm = Record<PriceTier, string>

function toForm(prices: TierPrices | undefined): PricingForm {
  return {
    BASE: prices ? String(prices.BASE) : '',
    INTERNAL: prices ? String(prices.INTERNAL) : '',
    ALUMNI: prices ? String(prices.ALUMNI) : '',
    DISCOUNT: prices ? String(prices.DISCOUNT) : '',
  }
}

/** Whole rupees only, and a blank box is a mistake rather than a free conference. */
function priceError(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return 'Put an amount in, or 0 if this tier pays nothing.'

  const amount = Number(trimmed)
  if (!Number.isInteger(amount)) return 'Whole rupees only, with no decimal point.'
  if (amount < 0) return 'A price cannot be negative.'
  if (amount > MAX_PRICE) return `That is above the ${MAX_PRICE.toLocaleString('en-IN')} cap.`

  return undefined
}

export function PricingSection() {
  const { data, isPending, isError, error, refetch } = usePricing()
  const save = useSavePricing()
  const toast = useToast()

  const [form, setForm] = useState<PricingForm>(toForm(undefined))
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (data) setForm(toForm(data))
  }, [data])

  const saved = toForm(data)
  const changed = TIERS.some(({ tier }) => form[tier].trim() !== saved[tier])
  const firstProblem = TIERS.map(({ tier }) => priceError(form[tier])).find(Boolean)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveError(null)

    // Only the tiers that actually moved. The server takes a partial body and
    // writes an audit line naming the keys it was given, so sending all four
    // every time would record four changes where one was made.
    const body: Partial<TierPrices> = {}
    for (const { tier } of TIERS) {
      if (form[tier].trim() !== saved[tier]) body[tier] = Number(form[tier].trim())
    }

    try {
      await save.mutateAsync(body)
      toast.success('Prices saved', 'The registration desk charges the new amounts from now on.')
    } catch (caught) {
      setSaveError(errorMessage(caught, 'Those prices could not be saved.'))
    }
  }

  return (
    <Card>
      <CardHeader
        title="Prices"
        description="What a delegate pays, in whole Nepali rupees. Whoever reviews a payment picks the tier, and the amount owed comes from here."
      />

      {isPending ? (
        <SkeletonRows rows={4} columns={2} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {saveError ? (
            <Callout tone="danger" alert>
              {saveError}
            </Callout>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {TIERS.map(({ tier, label, hint }) => {
              const problem = priceError(form[tier])
              return (
                <Field
                  key={tier}
                  label={label}
                  hint={hint}
                  {...(problem ? { error: problem } : {})}
                >
                  {({ id, describedBy, invalid }) => (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-data text-ink-secondary" aria-hidden>
                        Rs
                      </span>
                      <Input
                        id={id}
                        inputMode="numeric"
                        value={form[tier]}
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, [tier]: event.target.value }))
                        }
                        className="font-mono tabular-nums"
                      />
                    </div>
                  )}
                </Field>
              )
            })}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {changed ? (
              <p className="text-body-sm text-ink-secondary sm:mr-auto">Not saved yet.</p>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setForm(saved)
                setSaveError(null)
              }}
              disabled={!changed || save.isPending}
            >
              Undo changes
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!changed || Boolean(firstProblem)}>
              Save prices
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}
