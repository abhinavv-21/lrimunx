import { cn } from '@/lib/utils'
import { formatDayDate } from './conference'

export interface DayTab {
  day: number
  date: string

  /** Optional headline number for the day, e.g. delegates checked in. */
  count?: number

  /** What the count is out of. Only rendered when count is given. */
  of?: number
}

/**
 * The three days of the conference as one row of tabs.
 *
 * Three fixed columns rather than a dropdown: the whole point during the
 * conference is that switching day is one thumb press with no menu in the way,
 * and three is few enough to fit across 390px. Each tab carries its own number
 * so "who was thin on day 2" is answered by looking, not by switching.
 */
export function DaySwitcher({
  days,
  value,
  onChange,
  activeDay,
  label = 'Conference day',
  className,
}: {
  days: readonly DayTab[]
  value: number
  onChange: (day: number) => void

  /** The day the conference itself is on, marked "now". Omit before it starts. */
  activeDay?: number | undefined
  label?: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('grid grid-cols-3 gap-2', className)}>
      {days.map((tab) => {
        const selected = tab.day === value
        const live = tab.day === activeDay

        return (
          <button
            key={tab.day}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(tab.day)}
            className={cn(
              'flex min-h-tap flex-col justify-center gap-0.5 rounded-card border px-2.5 py-2 text-left',
              'transition-colors duration-micro ease-out',
              selected
                ? 'border-accent bg-accent-wash'
                : 'border-edge bg-surface hover:border-edge-strong hover:bg-surface-sunken',
            )}
          >
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'text-label uppercase',
                  selected ? 'text-accent' : 'text-ink-secondary',
                )}
              >
                Day {tab.day}
              </span>
              {live ? (
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-pill bg-accent"
                />
              ) : null}
              {live ? <span className="sr-only">(today)</span> : null}
            </span>

            <span className="font-mono text-data tabular-nums text-ink-secondary">
              {formatDayDate(tab.date)}
            </span>

            {tab.count !== undefined ? (
              <span className={cn('font-heading text-h2 tabular-nums', selected ? 'text-ink' : 'text-ink-secondary')}>
                {tab.count}
                {tab.of !== undefined ? (
                  <span className="font-sans text-body-sm font-normal text-ink-tertiary">/{tab.of}</span>
                ) : null}
                <span className="sr-only"> checked in</span>
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
