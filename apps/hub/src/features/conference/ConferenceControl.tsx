import { useState } from 'react'
import { CalendarCheck, Flag, Play, RotateCcw } from 'lucide-react'
import {
  useConference,
  useEndConference,
  useReopenConference,
  useSetConferenceDay,
  useStartConference,
} from '@/lib/hooks'
import { useIsOwner } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { errorMessage } from '@/lib/api'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Callout } from '@/components/ui/Callout'
import { ErrorState } from '@/components/ui/States'
import { DaySwitcher } from './DaySwitcher'
import { findDay, formatDayDate } from './conference'

/**
 * Starting the conference, moving it from day to day, ending it and reopening
 * it.
 *
 * This is the only place any of that happens. It sits on the dashboard because
 * that is the screen an admin lands on, and because every one of these changes
 * what other screens do. A check-in with no day named lands on the active day,
 * a logistics request's age clock runs twelve times faster once RUNNING, and
 * once ENDED both of those stop accepting writes at all.
 *
 * Each action asks once before it does it. Not because starting is dangerous
 * (an admin can move the day back, and check-ins are per-day rows that survive)
 * but because it is a decision, and a decision should not happen on a mis-tap
 * while someone is holding a phone in one hand. Ending genuinely is: it freezes
 * what everyone else is writing to, which is why it is the owner's and not
 * every admin's.
 */
export function ConferenceControl() {
  const conference = useConference()
  const start = useStartConference()
  const setDay = useSetConferenceDay()
  const end = useEndConference()
  const reopen = useReopenConference()
  const isOwner = useIsOwner()
  const toast = useToast()

  const [confirming, setConfirming] = useState<'start' | 'end' | 'reopen' | null>(null)

  async function confirmStart() {
    try {
      const mode = await start.mutateAsync()
      setConfirming(null)
      toast.success('The conference is running', `Everything now lands on day ${mode.activeDay}.`)
    } catch (caught) {
      toast.error('Could not start the conference', errorMessage(caught))
    }
  }

  async function confirmEnd() {
    try {
      await end.mutateAsync()
      setConfirming(null)
      toast.success('The conference has ended', 'Attendance and logistics are read-only from here.')
    } catch (caught) {
      toast.error('Could not end the conference', errorMessage(caught))
    }
  }

  async function confirmReopen() {
    try {
      const mode = await reopen.mutateAsync()
      setConfirming(null)
      toast.success('The conference is open again', `Back on day ${mode.activeDay}.`)
    } catch (caught) {
      toast.error('Could not reopen the conference', errorMessage(caught))
    }
  }

  async function moveTo(day: number) {
    try {
      await setDay.mutateAsync(day)
      toast.success(`Now on day ${day}`, 'New check-ins and requests land on this day.')
    } catch (caught) {
      toast.error('Could not change the day', errorMessage(caught))
    }
  }

  if (conference.isPending) {
    return (
      <Card>
        <div className="skeleton h-4 w-40" />
        <div className="skeleton mt-3 h-9 w-56" />
      </Card>
    )
  }

  if (conference.isError) {
    return <ErrorState error={conference.error} onRetry={() => void conference.refetch()} />
  }

  const mode = conference.data

  if (mode.state === 'PREPARING') {
    const firstDay = findDay(mode.days, 1)

    return (
      <>
        <Card className="border-accent">
          <CardHeader
            title="The conference has not started"
            description={
              firstDay
                ? `Start it on the morning of ${formatDayDate(firstDay.date)}. Until then a check-in lands on day 1 as a rehearsal, and a logistics request is filed with no day at all.`
                : 'Start it on the first morning. Until then a check-in lands on day 1 as a rehearsal, and a logistics request is filed with no day at all.'
            }
            actions={
              <Button onClick={() => setConfirming('start')}>
                <Play size={16} aria-hidden />
                Start the conference
              </Button>
            }
          />
        </Card>

        <Modal
          open={confirming === 'start'}
          onOpenChange={(open) => !open && setConfirming(null)}
          title="Start the conference?"
          description="This puts the hub on day 1 for everyone signed in."
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(null)} disabled={start.isPending}>
                Not yet
              </Button>
              <Button onClick={() => void confirmStart()} loading={start.isPending}>
                <Play size={16} aria-hidden />
                Start day 1
              </Button>
            </>
          }
        >
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-sm text-ink-secondary">
            <li>Check-ins with no day named are recorded against the day the conference is on.</li>
            <li>New requests are stamped with that day, and their priority climbs twelve times faster.</li>
            <li>
              You can move between day 1, 2 and 3 afterwards, and nothing already recorded moves with
              you. When it is over the hub owner ends it, which closes attendance and logistics to
              further edits until they reopen it.
            </li>
          </ul>
        </Modal>
      </>
    )
  }

  if (mode.state === 'ENDED') {
    const lastDay = findDay(mode.days, mode.activeDay)

    return (
      <>
        <Card>
          <CardHeader
            title="The conference is over"
            description={
              lastDay
                ? `It finished on day ${mode.activeDay}, ${formatDayDate(lastDay.date)}. Attendance and logistics are read-only: everything recorded over the three days can still be read and exported, and nothing more can be added to it.`
                : `It finished on day ${mode.activeDay}. Attendance and logistics are read-only: everything recorded over the three days can still be read and exported, and nothing more can be added to it.`
            }
            actions={
              isOwner ? (
                <Button variant="secondary" onClick={() => setConfirming('reopen')}>
                  <RotateCcw size={16} aria-hidden />
                  Reopen
                </Button>
              ) : undefined
            }
          />

          {isOwner ? null : (
            <p className="text-body-sm text-ink-secondary">
              If something was recorded wrongly, the hub owner can reopen the conference long enough
              to correct it.
            </p>
          )}
        </Card>

        <Modal
          open={confirming === 'reopen'}
          onOpenChange={(open) => !open && setConfirming(null)}
          title="Reopen the conference?"
          description={`It goes back to running on day ${mode.activeDay}, the day it finished on.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(null)} disabled={reopen.isPending}>
                Leave it closed
              </Button>
              <Button onClick={() => void confirmReopen()} loading={reopen.isPending}>
                <RotateCcw size={16} aria-hidden />
                Reopen on day {mode.activeDay}
              </Button>
            </>
          }
        >
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-sm text-ink-secondary">
            <li>Check-ins and logistics requests can be recorded and edited again.</li>
            <li>The header shows the conference as running to everyone signed in.</li>
            <li>Ending it again is one click, and both the end and this reopening are in the audit log.</li>
          </ul>
        </Modal>
      </>
    )
  }

  const today = findDay(mode.days, mode.activeDay)

  return (
    <>
      <Card className="border-accent">
        <CardHeader
          title={`Day ${mode.activeDay} of ${mode.days.length}${today ? ` · ${formatDayDate(today.date)}` : ''}`}
          description="Every check-in and every new request lands on this day until you move it on."
          actions={
            isOwner ? (
              <Button variant="secondary" onClick={() => setConfirming('end')}>
                <Flag size={16} aria-hidden />
                End the conference
              </Button>
            ) : undefined
          }
        />

        <DaySwitcher
          days={mode.days}
          value={mode.activeDay}
          onChange={(day) => void moveTo(day)}
          activeDay={mode.activeDay}
          label="Set the conference day"
        />

        {setDay.isPending ? (
          <Callout tone="info" className="mt-3">
            Moving the conference on…
          </Callout>
        ) : (
          <p className="mt-3 flex items-start gap-2 text-body-sm text-ink-secondary">
            <CalendarCheck size={16} className="mt-0.5 shrink-0 text-ink-tertiary" aria-hidden />
            Moving the day leaves what is already recorded alone. Yesterday's check-ins stay on yesterday.
          </p>
        )}
      </Card>

      <Modal
        open={confirming === 'end'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="End the conference?"
        description={`Day ${mode.activeDay} becomes the last day of it.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={end.isPending}>
              Not yet
            </Button>
            <Button variant="destructive" onClick={() => void confirmEnd()} loading={end.isPending}>
              <Flag size={16} aria-hidden />
              End it
            </Button>
          </>
        }
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-sm text-ink-secondary">
          <li>No more check-ins, on any of the three days, and no edits to the ones already there.</li>
          <li>Logistics requests can no longer be filed, reassigned, resolved or deleted.</li>
          <li>Everything stays readable and exportable, and you can reopen it if something needs fixing.</li>
        </ul>
      </Modal>
    </>
  )
}
