import { useEffect, useState, type FormEvent } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Field, Input } from '@/components/ui/Field'
import { ErrorState, SkeletonRows } from '@/components/ui/States'
import { errorMessage } from '@/lib/api'
import { useSaveSettings, useSettings } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import type { Settings } from '@/types/api'

/*
 * These six values are read from and written to GET/PUT /settings, the same
 * endpoint that already stores googleFormUrl and googleSheetUrl. The server
 * only keeps keys listed in SETTING_KEYS (apps/backend/src/schemas/index.ts)
 * and only accepts keys named in updateSettingsSchema; all six are in both.
 */
type ConferenceForm = Pick<
  Required<Settings>,
  'conferenceName' | 'edition' | 'startsOn' | 'endsOn' | 'venue' | 'contactEmail'
>

function toForm(settings: Settings | undefined): ConferenceForm {
  return {
    conferenceName: settings?.conferenceName ?? '',
    edition: settings?.edition ?? '',
    startsOn: settings?.startsOn ?? '',
    endsOn: settings?.endsOn ?? '',
    venue: settings?.venue ?? '',
    contactEmail: settings?.contactEmail ?? '',
  }
}

export function ConferenceDetails() {
  const { data, isPending, isError, error, refetch } = useSettings()
  const save = useSaveSettings()
  const toast = useToast()

  const [form, setForm] = useState<ConferenceForm>(toForm(undefined))
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (data) setForm(toForm(data))
  }, [data])

  const saved = toForm(data)
  const changed = (Object.keys(saved) as Array<keyof ConferenceForm>).some(
    (key) => form[key].trim() !== saved[key],
  )

  const datesOutOfOrder =
    form.startsOn !== '' && form.endsOn !== '' && form.endsOn < form.startsOn

  function set(key: keyof ConferenceForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveError(null)

    try {
      await save.mutateAsync({
        conferenceName: form.conferenceName.trim(),
        edition: form.edition.trim(),
        startsOn: form.startsOn,
        endsOn: form.endsOn,
        venue: form.venue.trim(),
        contactEmail: form.contactEmail.trim(),
      })
      toast.success('Conference details saved', 'The public site picks these up on its next build.')
    } catch (caught) {
      setSaveError(errorMessage(caught, 'Those details could not be saved.'))
    }
  }

  return (
    <Card>
      <CardHeader
        title="Conference details"
        description="What this conference is called, when it runs and where. Delegates see these on the public site and in the mail they get."
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
            <Field label="Conference name">
              {({ id }) => (
                <Input
                  id={id}
                  value={form.conferenceName}
                  onChange={(event) => set('conferenceName', event.target.value)}
                  placeholder="LRI Model United Nations"
                />
              )}
            </Field>
            <Field label="Edition" hint="However you write it on the placards.">
              {({ id }) => (
                <Input
                  id={id}
                  value={form.edition}
                  onChange={(event) => set('edition', event.target.value)}
                  placeholder="X"
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First day">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={form.startsOn}
                  onChange={(event) => set('startsOn', event.target.value)}
                  className="font-mono"
                />
              )}
            </Field>
            <Field
              label="Last day"
              error={datesOutOfOrder ? 'The last day falls before the first one.' : undefined}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="date"
                  value={form.endsOn}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onChange={(event) => set('endsOn', event.target.value)}
                  className="font-mono"
                />
              )}
            </Field>
          </div>

          <Field label="Venue" hint="The address delegates should turn up to.">
            {({ id }) => (
              <Input
                id={id}
                value={form.venue}
                onChange={(event) => set('venue', event.target.value)}
                placeholder="LRI School, Kalanki, Kathmandu"
              />
            )}
          </Field>

          <Field label="Contact email" hint="Where delegates write when something goes wrong.">
            {({ id }) => (
              <Input
                id={id}
                type="email"
                value={form.contactEmail}
                onChange={(event) => set('contactEmail', event.target.value)}
                placeholder="mun@lrischool.edu.np"
                className="font-mono"
              />
            )}
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {changed ? (
              <p className="text-body-sm text-ink-secondary sm:mr-auto">Not saved yet.</p>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setForm(saved); setSaveError(null) }}
              disabled={!changed || save.isPending}
            >
              Undo changes
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!changed || datesOutOfOrder}>
              Save details
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}
