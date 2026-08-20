import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card, CardHeader } from '@/components/ui/Card'
import { CONFIRM_PHRASE, ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States'
import { errorMessage } from '@/lib/api'
import { useAnnounceBatch, useAnnouncePreview, useClearAnnounceFailures } from '@/lib/hooks'
import { pluralise } from '@/lib/utils'
import { useToast } from '@/providers/ToastProvider'
import type { AnnouncePreview, ExclusionReason } from '@/types/api'
import { IDLE_RUN, runAnnouncement, type RunProgress } from './announceRun'

/** Reasons a delegate is held back, in the order an operator can act on them. */
const HELD_BACK: Array<{ reason: ExclusionReason; label: string }> = [
  { reason: 'NO_ALLOCATION', label: 'have no committee yet' },
  { reason: 'NO_EMAIL', label: 'have no email address on file' },
  { reason: 'NO_STUDY_GUIDE', label: 'are in a committee with no study guide' },
]

const FAILURES_SHOWN = 5

function heldBackTotal(counts: AnnouncePreview['excludedCounts']): number {
  return HELD_BACK.reduce((sum, { reason }) => sum + counts[reason], 0)
}

function Tally({ label, value, hint, accent = false }: {
  label: string
  value: number
  hint: string
  accent?: boolean
}) {
  return (
    <div className="rounded-control border border-edge bg-surface-sunken p-4">
      <p className="text-label uppercase text-ink-secondary">{label}</p>
      <p
        className={`mt-1 font-heading text-h1 tabular-nums ${accent ? 'text-accent' : 'text-ink'}`}
      >
        {value}
      </p>
      <p className="mt-1 text-body-sm text-ink-secondary">{hint}</p>
    </div>
  )
}

export function AnnouncementSection() {
  const [includeStudyGuide, setIncludeStudyGuide] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [run, setRun] = useState<RunProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [planned, setPlanned] = useState(0)
  const [runError, setRunError] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  // The ref is what the loop reads: it is inside a closure that never sees a
  // re-render. The state exists only so the button can say so straight away,
  // because the batch already in flight takes several seconds to come back.
  const stopRequested = useRef(false)

  const { data, isPending, isError, error, refetch } = useAnnouncePreview(includeStudyGuide)
  const batch = useAnnounceBatch()
  const clearFailures = useClearAnnounceFailures()
  const queryClient = useQueryClient()
  const toast = useToast()

  const failedBefore = data?.recipients.filter((r) => r.previousError !== null) ?? []
  const blockedByGuides = includeStudyGuide && (data?.committeesMissingGuide.length ?? 0) > 0
  const rateLimited = run !== null && run.end === 'rate-limited' ? run : null

  async function send() {
    if (!data) return

    setConfirmOpen(false)
    setRunError(null)
    setPlanned(data.willSend)
    // Seeded with the whole audience so the first few seconds read "400 left"
    // rather than "0 left" while the opening batch is still in flight.
    setRun({ ...IDLE_RUN, remaining: data.willSend })
    setRunning(true)
    setStopping(false)
    stopRequested.current = false

    try {
      const finished = await runAnnouncement({
        send: () => batch.mutateAsync({ passphrase: CONFIRM_PHRASE, includeStudyGuide }),
        onProgress: setRun,
        shouldStop: () => stopRequested.current,
      })

      setRun(finished)
      if (finished.sent > 0) {
        toast.success(
          `${pluralise(finished.sent, 'email')} sent`,
          finished.failed > 0 ? `${pluralise(finished.failed, 'address')} refused.` : undefined,
        )
      }
    } catch (caught) {
      setRunError(
        errorMessage(caught, 'The send stopped part way. Nothing further was mailed.'),
      )
    } finally {
      setRunning(false)
      void refetch()
      void queryClient.invalidateQueries({ queryKey: ['audit'] })
    }
  }

  function clearFailureRecord() {
    clearFailures
      .mutateAsync()
      .then((result) => {
        toast.success(
          'Failure record cleared',
          `${pluralise(result.cleared, 'delegate')} will be tried again as a first attempt.`,
        )
      })
      .catch((caught: unknown) => {
        toast.error('Could not clear the record', errorMessage(caught))
      })
  }

  const attempted = run ? run.sent + run.failed : 0
  const percent = planned > 0 ? Math.min(100, Math.round((attempted / planned) * 100)) : 0

  return (
    <Card>
      <CardHeader
        title="Send allocation emails"
        description="One email to every allocated delegate, telling them their committee, their country and where the study guide is. Once a message has left the building it cannot be recalled."
      />

      {isPending ? (
        <SkeletonRows rows={4} columns={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          {!data.emailConfigured ? (
            <Callout tone="warning">
              <p className="font-medium">No mail server is set up on this deployment.</p>
              <p className="mt-1">
                The API refuses to send until{' '}
                <code className="font-mono text-data">SMTP_HOST</code>,{' '}
                <code className="font-mono text-data">SMTP_USER</code>,{' '}
                <code className="font-mono text-data">SMTP_PASSWORD</code> and{' '}
                <code className="font-mono text-data">SMTP_FROM</code> are set in its environment.
                Set them, restart the API, then reload this page.
              </p>
            </Callout>
          ) : null}

          {data.willSend === 0 &&
          data.excludedCounts.ALREADY_SENT === 0 &&
          heldBackTotal(data.excludedCounts) === 0 ? (
            <EmptyState
              icon={Send}
              title="Nobody has a seat yet"
              description="Allocate delegates to committees first. This sends to whoever holds a seat, and there is nobody to tell."
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Tally
                  label="Ready to send"
                  value={data.willSend}
                  hint={
                    data.willSend === 0
                      ? 'Nobody is waiting on an email.'
                      : `${pluralise(data.batchesNeeded, 'batch', 'batches')} of ${data.batchSize}.`
                  }
                  accent={data.willSend > 0}
                />
                <Tally
                  label="Already emailed"
                  value={data.excludedCounts.ALREADY_SENT}
                  hint="Skipped every time, so nobody is told twice."
                />
                <Tally
                  label="Held back"
                  value={heldBackTotal(data.excludedCounts)}
                  hint="Something is missing on the delegate or the committee."
                />
              </div>

              {heldBackTotal(data.excludedCounts) > 0 ? (
                <ul className="flex flex-col gap-1 text-body-sm text-ink-secondary">
                  {HELD_BACK.filter(({ reason }) => data.excludedCounts[reason] > 0).map(
                    ({ reason, label }) => (
                      <li key={reason}>
                        <span className="font-medium text-ink">
                          {pluralise(data.excludedCounts[reason], 'delegate')}
                        </span>{' '}
                        {label}
                        {reason === 'NO_STUDY_GUIDE' && data.committeesMissingGuide.length > 0
                          ? ` (${data.committeesMissingGuide.join(', ')})`
                          : ''}
                        .
                      </li>
                    ),
                  )}
                </ul>
              ) : null}

              <label className="flex min-h-tap items-center gap-3 text-body-sm text-ink md:min-h-10">
                <input
                  type="checkbox"
                  checked={includeStudyGuide}
                  disabled={running}
                  onChange={(event) => setIncludeStudyGuide(event.target.checked)}
                  className="size-4 rounded-control accent-accent"
                />
                Include a link to the study guide
              </label>

              {blockedByGuides ? (
                <Callout tone="warning">
                  No study guide is set for {data.committeesMissingGuide.join(', ')}. The API refuses
                  the whole send rather than mail a dead link. Add the guide on each committee, or
                  untick the box above to send without one.
                </Callout>
              ) : null}

              {!includeStudyGuide ? (
                <Callout tone="info">
                  Delegates will be told their committee and country but not where to read for it.
                </Callout>
              ) : null}

              {runError ? (
                <Callout tone="danger" alert>
                  {runError}
                </Callout>
              ) : null}

              {run !== null ? (
                <div className="rounded-control border border-edge bg-surface-sunken p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-body-sm text-ink" aria-live="polite">
                      {running
                        ? `Sending batch ${run.batches + 1} of about ${Math.max(1, Math.ceil(planned / data.batchSize))}…`
                        : 'Run finished.'}
                    </p>
                    <p className="font-mono text-data tabular-nums text-ink-secondary">
                      {run.sent} sent · {run.failed} failed · {run.remaining} left
                    </p>
                  </div>

                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface"
                    role="progressbar"
                    aria-valuenow={attempted}
                    aria-valuemin={0}
                    aria-valuemax={planned}
                    aria-label="Emails sent so far"
                  >
                    <div
                      className="h-full rounded-pill bg-accent transition-all duration-standard ease-standard"
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {run.end === 'done' && !running ? (
                    <p className="mt-3 text-body-sm text-ink">
                      {run.remaining === 0
                        ? `Everyone has been told. ${pluralise(run.sent, 'email')} sent.`
                        : `The batch sent nothing, so the run stopped. ${pluralise(run.remaining, 'delegate')} still waiting, and the addresses below are why.`}
                    </p>
                  ) : null}

                  {run.end === 'stopped' ? (
                    <p className="mt-3 text-body-sm text-ink">
                      Stopped at your request after {pluralise(run.batches, 'batch', 'batches')}.{' '}
                      {pluralise(run.remaining, 'delegate')} still waiting. Send again when you are
                      ready. Nobody already emailed is emailed twice.
                    </p>
                  ) : null}

                  {run.end === 'capped' ? (
                    <p className="mt-3 text-body-sm text-ink">
                      Stopped after {pluralise(run.batches, 'batch', 'batches')}, which is the limit
                      on one run. {pluralise(run.remaining, 'delegate')} still waiting. Send
                      again to carry on.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {rateLimited !== null ? (
                <Callout tone="warning" alert>
                  <p className="font-medium">The mail provider has stopped accepting messages.</p>
                  <p className="mt-1">
                    {rateLimited.message ??
                      'It refused for volume rather than for a bad address. Gmail and Workspace cap a day at around 500 recipients.'}{' '}
                    {pluralise(rateLimited.remaining, 'delegate')} still waiting. Wait an hour, then say you
                    are ready.
                  </p>
                  <Button variant="secondary" size="sm" className="mt-2" onClick={() => setRun(null)}>
                    I have waited. Let me send the rest
                  </Button>
                </Callout>
              ) : null}

              <div className="flex flex-col-reverse gap-2 border-t border-edge pt-4 sm:flex-row sm:items-center sm:justify-end">
                {running ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      stopRequested.current = true
                      setStopping(true)
                    }}
                    disabled={stopping}
                  >
                    {stopping ? 'Stopping after this batch…' : 'Stop after this batch'}
                  </Button>
                ) : null}

                <Button
                  onClick={() => setConfirmOpen(true)}
                  loading={running}
                  disabled={
                    data.willSend === 0 ||
                    !data.emailConfigured ||
                    blockedByGuides ||
                    rateLimited !== null
                  }
                >
                  <Send size={16} aria-hidden />
                  {running
                    ? 'Sending…'
                    : data.willSend === 0
                      ? 'Nobody to send to'
                      : `Send to ${pluralise(data.willSend, 'delegate')}`}
                </Button>
              </div>

              {failedBefore.length > 0 ? (
                <div className="rounded-control border border-edge p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-h3 text-ink">
                        {pluralise(failedBefore.length, 'address')} the mail server refused
                      </h3>
                      <p className="mt-1 max-w-prose text-body-sm text-ink-secondary">
                        They are tried again by the next send either way. Clear the record once you
                        have fixed the addresses, so the reasons here are not stale.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={clearFailures.isPending}
                      disabled={running}
                      onClick={clearFailureRecord}
                    >
                      Clear the record
                    </Button>
                  </div>

                  <ul className="mt-3 flex flex-col gap-2">
                    {failedBefore.slice(0, FAILURES_SHOWN).map((recipient) => (
                      <li key={recipient.delegateId} className="min-w-0">
                        <p className="truncate text-body-sm text-ink">
                          {recipient.fullName}{' '}
                          <span className="font-mono text-data text-ink-secondary">
                            {recipient.email}
                          </span>
                        </p>
                        <p className="text-body-sm text-danger">{recipient.previousError}</p>
                      </li>
                    ))}
                  </ul>

                  {failedBefore.length > FAILURES_SHOWN ? (
                    <p className="mt-2 text-body-sm text-ink-secondary">
                      and {failedBefore.length - FAILURES_SHOWN} more.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {data.willSend === 0 && data.excludedCounts.ALREADY_SENT > 0 ? (
                <Callout tone="success">
                  Everyone with a seat has been emailed. Allocate someone new and they appear here.
                </Callout>
              ) : null}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Email ${pluralise(data?.willSend ?? 0, 'delegate')}?`}
        description={`This sends one email each to ${pluralise(data?.willSend ?? 0, 'delegate')}${
          includeStudyGuide ? ' with their study guide link' : ' without a study guide link'
        }. It cannot be undone. Anyone already emailed is skipped, and this screen has to stay open until the run finishes.`}
        confirmLabel="Send the emails"
        confirmPhrase={CONFIRM_PHRASE}
        onConfirm={() => void send()}
      />
    </Card>
  )
}
