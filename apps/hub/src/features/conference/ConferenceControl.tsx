import { useState } from 'react'
import { CalendarCheck, Play } from 'lucide-react'
import { useConference, useSetConferenceDay, useStartConference } from '@/lib/hooks'
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
 * Starting the conference, and moving it from day to day.
 *
 * This is the only place either happens. It sits on the dashboard because that
 * is the screen an admin lands on, and because both actions change what every
 * other screen does — a check-in with no day named lands on the active day, and
 * a logistics request's age clock runs twelve times faster once RUNNING.
 *
 * Starting asks once before it does it. Not because it is dangerous (an admin
 * can move the day back, and check-ins are per-day rows that survive) but
 * because it is a decision, and a decision should not happen on a mis-tap while
 * someone is holding a phone in one hand.
 */
export function ConferenceControl() {
  const conference = useConference()
  const start = useStartConference()
  const setDay = useSetConferenceDay()
  const toast = useToast()

  const [confirming, setConfirming] = useState(false)

  async function confirmStart() {
    try {
      const mode = await start.mutateAsync()
      setConfirming(false)
      toast.success('The conference is running', `Everything now lands on day ${mode.activeDay}.`)
    } catch (caught) {
      toast.error('Could not start the conference', errorMessage(caught))
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
              <Button onClick={() => setConfirming(true)}>
                <Play size={16} aria-hidden />
                Start the conference
              </Button>
            }
          />
        </Card>

        <Modal
          open={confirming}
          onOpenChange={setConfirming}
          title="Start the conference?"
          description="This puts the hub on day 1 for everyone signed in."
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={start.isPending}>
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
              you. Going back to preparing is not something the hub can do — that takes a reset.
            </li>
          </ul>
        </Modal>
      </>
    )
  }

  const today = findDay(mode.days, mode.activeDay)

  return (
    <Card className="border-accent">
      <CardHeader
        title={`Day ${mode.activeDay} of ${mode.days.length}${today ? ` · ${formatDayDate(today.date)}` : ''}`}
        description="Every check-in and every new request lands on this day until you move it on."
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
  )
}
