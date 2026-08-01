import { useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, ExternalLink, FileSpreadsheet } from 'lucide-react'
import { useSaveSettings, useSettings } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import { BASE_URL, ApiError } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { ErrorState, SkeletonCards } from '@/components/ui/States'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked; the value is selectable either way.
    }
  }

  return (
    <div>
      <p className="text-label uppercase text-ink-secondary">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="table-scroll min-w-0 flex-1 whitespace-nowrap rounded-control border border-edge bg-surface-sunken px-3 py-2 font-mono text-data text-ink">
          {value}
        </code>
        <Button variant="secondary" size="sm" onClick={() => void copy()} aria-label={`Copy ${label}`}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { data, isPending, isError, error, refetch } = useSettings()
  const save = useSaveSettings()
  const toast = useToast()

  const [formUrl, setFormUrl] = useState('')
  const [sheetUrl, setSheetUrl] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setFormUrl(data.googleFormUrl)
    setSheetUrl(data.googleSheetUrl)
  }, [data])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldError(null)
    try {
      await save.mutateAsync({ googleFormUrl: formUrl.trim(), googleSheetUrl: sheetUrl.trim() })
      toast.success('Links saved')
    } catch (caught) {
      setFieldError(caught instanceof ApiError ? caught.message : 'Could not save these links.')
    }
  }

  const dirty = Boolean(data && (formUrl !== data.googleFormUrl || sheetUrl !== data.googleSheetUrl))

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Where registrations come from, and how the form feeds this hub."
      />

      {isPending ? (
        <SkeletonCards count={2} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title="Registration form"
              description="Paste the Google Form and its responses sheet so anyone on the team can open them from here."
            />

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              {fieldError ? (
                <p role="alert" className="rounded-control border border-danger bg-danger-wash p-3 text-body-sm text-ink">
                  {fieldError}
                </p>
              ) : null}

              <Field label="Google Form link" hint="The public link delegates use to register.">
                {({ id }) => (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id={id}
                      type="url"
                      value={formUrl}
                      onChange={(event) => setFormUrl(event.target.value)}
                      placeholder="https://docs.google.com/forms/d/e/…/viewform"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    {data.googleFormUrl ? (
                      <Button asChild variant="secondary" className="shrink-0">
                        <a href={data.googleFormUrl} target="_blank" rel="noreferrer noopener">
                          <ExternalLink size={16} aria-hidden />
                          Open
                        </a>
                      </Button>
                    ) : null}
                  </div>
                )}
              </Field>

              <Field label="Responses sheet link" hint="The Google Sheet the form writes into. Optional.">
                {({ id }) => (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id={id}
                      type="url"
                      value={sheetUrl}
                      onChange={(event) => setSheetUrl(event.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    {data.googleSheetUrl ? (
                      <Button asChild variant="secondary" className="shrink-0">
                        <a href={data.googleSheetUrl} target="_blank" rel="noreferrer noopener">
                          <FileSpreadsheet size={16} aria-hidden />
                          Open
                        </a>
                      </Button>
                    ) : null}
                  </div>
                )}
              </Field>

              <div className="flex justify-end">
                <Button type="submit" loading={save.isPending} disabled={!dirty}>
                  Save links
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="Automatic import"
              description="Point the form's Apps Script at this endpoint and each submission becomes a delegate automatically."
            />

            <div className="flex flex-col gap-4">
              <CopyField label="Webhook endpoint" value={`${BASE_URL}/integrations/google-sheets`} />

              <div>
                <p className="text-label uppercase text-ink-secondary">Setup</p>
                <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-body-sm text-ink-secondary">
                  <li>Open the responses sheet → Extensions → Apps Script.</li>
                  <li>
                    Paste the script from <code className="font-mono text-data">integrations/google-apps-script/Code.gs</code> in the repository.
                  </li>
                  <li>
                    In Project Settings → Script Properties add <code className="font-mono text-data">HUB_ENDPOINT</code> (above)
                    and <code className="font-mono text-data">WEBHOOK_SECRET</code> (the value of{' '}
                    <code className="font-mono text-data">GOOGLE_SHEETS_WEBHOOK_SECRET</code> in the server's .env).
                  </li>
                  <li>Add a trigger: onFormSubmit → From spreadsheet → On form submit.</li>
                </ol>
              </div>

              <p className="max-w-prose rounded-control border border-edge bg-surface-sunken p-3 text-body-sm text-ink-secondary">
                Delegates are matched on email, so re-sending a row updates the existing record instead of
                creating a duplicate. Committee and country are never imported — those are set in Allocations.
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
