import { CalendarClock, CalendarDays } from 'lucide-react'
import { useConference } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { findDay, formatDayDate } from './conference'

const PILL = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-label uppercase'

/**
 * Which day it is, in the header, on every screen.
 *
 * It is read-only on purpose. Switching the conference on is a decision one
 * person makes once; putting the control in a bar that every volunteer sees on
 * every page is how it gets pressed by accident. The controls live on the
 * dashboard, where an admin looks first on the morning of day 1.
 */
export function ConferencePill({ className }: { className?: string }) {
  const { data, isPending, isError } = useConference()

  if (isPending) {
    return <span className="skeleton h-6 w-20 rounded-pill" role="status" aria-label="Loading conference status" />
  }

  if (isError || !data) {
    return (
      <span className={cn(PILL, 'border-edge-strong bg-surface-sunken text-ink-secondary', className)}>
        <CalendarClock size={14} className="shrink-0" aria-hidden />
        Day unknown
      </span>
    )
  }

  if (data.state === 'PREPARING') {
    return (
      <span
        role="status"
        className={cn(PILL, 'border-edge-strong bg-surface-sunken text-ink-secondary', className)}
      >
        <CalendarClock size={14} className="shrink-0" aria-hidden />
        Preparing
      </span>
    )
  }

  const today = findDay(data.days, data.activeDay)

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(PILL, 'border-accent/40 bg-accent-wash text-accent', className)}
    >
      <CalendarDays size={14} className="shrink-0" aria-hidden />
      Day {data.activeDay}
      {today ? <span className="hidden sm:inline">· {formatDayDate(today.date)}</span> : null}
    </span>
  )
}
