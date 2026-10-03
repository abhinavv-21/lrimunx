/**
 * @vitest-environment jsdom
 *
 * The countdown band under the hero (apps/site/src/modules/countdown.js).
 *
 * The dates are midnight in Kathmandu, UTC+5:45, and the dev machines sit in
 * Kathmandu. Anything built on local-time getters would pass here and be wrong
 * for a reader in London, so every instant below is an ISO string with an
 * explicit +05:45 offset, and the suite is meant to be run under TZ=UTC and
 * TZ=America/Los_Angeles as well as the machine default.
 *
 * Same arrangement as siteRendering.dom.test.ts: apps/site has no runner, so
 * this lives in the backend suite and loads the real index.html body.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error -- plain ESM from the site workspace, no types by design
import { countdownState, spokenCountdown, initCountdown } from '../../../site/src/modules/countdown.js'
// @ts-expect-error -- plain ESM from the site workspace, no types by design
import { initStructuredData } from '../../../site/src/modules/structured-data.js'

interface State {
  phase: 'before' | 'final' | 'during' | 'after'
  days: number
  hours: number
  minutes: number
  seconds: number
  day: number | null
  totalDays: number
  progress: number
}

const DAY = 86400000
const at = (iso: string) => Date.parse(iso)

const START = at('2027-01-09T00:00:00+05:45')
const AFTER = at('2027-01-12T00:00:00+05:45')
const BOUNDS = { startMs: START, afterMs: AFTER, anchorMs: START - 100 * DAY }

const stateAt = (ms: number) => countdownState(ms, BOUNDS) as State
const spoken = (s: Partial<State>, dates?: string[]) =>
  spokenCountdown({ phase: 'before', days: 0, hours: 0, minutes: 0, seconds: 0, day: null, totalDays: 3, ...s }, dates) as string

const DATES = [
  'Saturday 9 January 2027, Poush 25, 2083 BS',
  'Sunday 10 January 2027, Poush 26, 2083 BS',
  'Monday 11 January 2027, Poush 27, 2083 BS',
]

const here = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(here, '../../../site')
const HTML = readFileSync(path.join(siteRoot, 'index.html'), 'utf8')
const BODY = HTML.replace(/[\s\S]*<body[^>]*>/i, '').replace(/<\/body>[\s\S]*/i, '')

function stubGsap(reduced = true) {
  // `to` runs onComplete straight away, so the midnight crossfade completes
  // when motion is on. Nothing here asserts on the animation itself.
  const to = vi.fn((_t: unknown, vars?: { onComplete?: () => void }) => vars?.onComplete?.())
  const noop = vi.fn()
  return {
    gsap: { set: noop, to, from: noop, fromTo: noop, killTweensOf: noop, timeline: noop },
    ScrollTrigger: { create: vi.fn(() => ({ kill: noop })) },
    reduced,
  }
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement
const text = (sel: string) => q(sel).textContent?.trim() ?? ''
const clock = () =>
  ['hours', 'minutes', 'seconds'].map((u) => text(`[data-cd-unit="${u}"]`)).join(':')

/** Every initCountdown leaves a visibilitychange listener on document until cleaned up. */
const cleanups: (() => void)[] = []

beforeEach(() => {
  document.body.innerHTML = BODY
})

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  // Backend vitest runs singleFork: fake timers left on would leak into the next file.
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.documentElement.className = ''
})

describe('countdownState, at the edges', () => {
  it('is still "before" at one day and a millisecond out, with exactly one day left', () => {
    const s = stateAt(START - DAY - 1)
    expect(s).toMatchObject({ phase: 'before', days: 1, hours: 0, minutes: 0, seconds: 0, day: null })
  })

  it('is "before", not "final", at exactly 24 hours out', () => {
    expect(stateAt(at('2027-01-08T00:00:00+05:45'))).toMatchObject({
      phase: 'before',
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
    })
  })

  it('turns "final" one millisecond inside the last 24 hours, with no whole day left', () => {
    expect(stateAt(START - DAY + 1)).toMatchObject({
      phase: 'final',
      days: 0,
      hours: 23,
      minutes: 59,
      seconds: 59,
    })
  })

  it('rounds down to all zeros one millisecond before the start', () => {
    expect(stateAt(START - 1)).toMatchObject({ phase: 'final', days: 0, hours: 0, minutes: 0, seconds: 0 })
    expect(stateAt(START - 1999).seconds).toBe(1)
  })

  it('is day 1 of 3 at exactly midnight on 9 January, Kathmandu', () => {
    expect(stateAt(START)).toMatchObject({ phase: 'during', day: 1, totalDays: 3, days: 0, seconds: 0 })
  })

  it('is day 2 from midnight on 10 January, Kathmandu', () => {
    expect(stateAt(at('2027-01-09T23:59:59.999+05:45')).day).toBe(1)
    expect(stateAt(at('2027-01-10T00:00:00+05:45')).day).toBe(2)
  })

  it('is still day 3 at 23:59:59.999 on 11 January', () => {
    expect(stateAt(at('2027-01-11T23:59:59.999+05:45'))).toMatchObject({ phase: 'during', day: 3 })
  })

  it('is "after" at exactly midnight on 12 January, with no day number', () => {
    expect(stateAt(AFTER)).toMatchObject({ phase: 'after', day: null, totalDays: 3, progress: 1 })
  })

  it('reads the Kathmandu wall clock, not the UTC one, near the start', () => {
    // 18:15 UTC on the 8th is midnight on the 9th in Kathmandu.
    expect(stateAt(at('2027-01-08T18:15:00Z')).phase).toBe('during')
    expect(stateAt(at('2027-01-08T18:14:59.999Z')).phase).toBe('final')
  })

  it('counts thousands of days from far in the past, with the ruler at 0', () => {
    // 2020-01-01 to 2027-01-09: 7 years with two leap days (2020, 2024), plus 8.
    const s = stateAt(at('2020-01-01T00:00:00+05:45'))
    expect(s).toMatchObject({ phase: 'before', days: 2565, hours: 0, minutes: 0, seconds: 0, progress: 0 })
  })

  it('puts the ruler at 0 at the anchor, 0.5 halfway, and 1 at the start', () => {
    expect(stateAt(BOUNDS.anchorMs).progress).toBe(0)
    expect(stateAt(BOUNDS.anchorMs - 1).progress).toBe(0)
    expect(stateAt(START - 50 * DAY).progress).toBeCloseTo(0.5, 12)
    expect(stateAt(START).progress).toBe(1)
    expect(stateAt(at('2027-01-10T12:00:00+05:45')).progress).toBe(1)
  })

  it('splits a mixed remainder into days, hours, minutes and seconds', () => {
    // 98 days, 14 h, 6 min, 30 s before the start.
    expect(stateAt(at('2026-10-02T09:53:30+05:45'))).toMatchObject({
      phase: 'before',
      days: 98,
      hours: 14,
      minutes: 6,
      seconds: 30,
    })
  })
})

describe('spokenCountdown', () => {
  it('reads days, hours and minutes with "and" before the last', () => {
    expect(spoken({ days: 98, hours: 14, minutes: 6, seconds: 30 })).toBe('98 days, 14 hours and 6 minutes.')
  })

  it('uses the singular for one of anything', () => {
    expect(spoken({ days: 1, hours: 1, minutes: 1 })).toBe('1 day, 1 hour and 1 minute.')
  })

  it('leaves out units that are zero', () => {
    expect(spoken({ days: 2, hours: 0, minutes: 5 })).toBe('2 days and 5 minutes.')
    expect(spoken({ days: 3 })).toBe('3 days.')
    expect(spoken({ days: 0, hours: 1 })).toBe('1 hour.')
    expect(spoken({ phase: 'final', hours: 23, minutes: 59, seconds: 59 })).toBe('23 hours and 59 minutes.')
  })

  it('reads minutes alone under an hour, and never reads seconds', () => {
    expect(spoken({ phase: 'final', minutes: 6, seconds: 59 })).toBe('6 minutes.')
  })

  it('says "Less than a minute." with only seconds left', () => {
    expect(spoken({ phase: 'final', seconds: 59 })).toBe('Less than a minute.')
    expect(spokenCountdown(stateAt(START - 1))).toBe('Less than a minute.')
  })

  it('names the day, with its long date when given one', () => {
    expect(spoken({ phase: 'during', day: 2 }, DATES)).toBe(
      'Day 2 of 3. Sunday 10 January 2027, Poush 26, 2083 BS.',
    )
    expect(spoken({ phase: 'during', day: 2 })).toBe('Day 2 of 3.')
    expect(spoken({ phase: 'during', day: 2 }, [])).toBe('Day 2 of 3.')
  })

  it('says "Adjourned." afterwards, dates or not', () => {
    expect(spoken({ phase: 'after' }, DATES)).toBe('Adjourned.')
    expect(spoken({ phase: 'after' })).toBe('Adjourned.')
  })
})

describe('the no-JS markup in index.html', () => {
  const doc = new DOMParser().parseFromString(HTML, 'text/html')
  const band = doc.querySelector('[data-countdown]') as HTMLElement
  const inBand = (sel: string) => band.querySelector(sel) as HTMLElement

  it('reads as a sentence: "Day one begins", "Saturday, at midnight", Kathmandu time', () => {
    expect(inBand('[data-cd-eyebrow]').textContent?.trim()).toBe('Day one begins')
    expect(inBand('[data-cd-static]').textContent?.trim()).toBe('Saturday, at midnight')
    expect(inBand('[data-cd-static]').hasAttribute('hidden')).toBe(false)
    expect(inBand('[data-cd-ref]').textContent?.trim()).toBe('Kathmandu time, UTC+5:45.')
  })

  it('hides the clock, the ruler and the empty numerals until the script runs', () => {
    for (const sel of ['[data-cd-clock]', '[data-cd-ruler]', '[data-cd-days]', '[data-cd-session]', '[data-cd-adjourned]']) {
      expect(inBand(sel).hasAttribute('hidden'), `${sel} should ship hidden`).toBe(true)
    }
    expect(inBand('[data-cd-spoken]').textContent).toBe('')
  })
})

describe('the dates, which live in three places', () => {
  const start = () => q('[data-conference-start]').getAttribute('datetime')
  const end = () => q('[data-conference-end]').getAttribute('datetime')

  it('match the structured data startDate and endDate', () => {
    initStructuredData()
    const script = document.head.querySelector('script[type="application/ld+json"]') as HTMLScriptElement
    try {
      const graph = JSON.parse(script.textContent ?? '{}')['@graph'] as { '@type': string; startDate?: string; endDate?: string }[]
      const event = graph.find((node) => node['@type'] === 'EducationEvent')
      expect(event?.startDate).toBe(start())
      expect(event?.endDate).toBe(end())
    } finally {
      script.remove()
    }
  })

  it('match the static "Saturday" and one day label per conference day', () => {
    // Weekday of the calendar date itself, independent of the machine zone.
    const weekday = new Date(`${start()}T00:00:00Z`).getUTCDay()
    expect(weekday, 'the no-JS copy says Saturday').toBe(6)

    const labels = Array.from(document.querySelectorAll('[data-cd-date]')).map(
      (li) => (li as HTMLElement).dataset['cdDate'],
    )
    const span = (Date.parse(`${end()}T00:00:00Z`) - Date.parse(`${start()}T00:00:00Z`)) / DAY + 1
    expect(labels).toHaveLength(span)
    expect(labels).toEqual(DATES)
  })
})

describe('initCountdown on the real page', () => {
  const BEFORE = '2026-10-02T09:53:30+05:45' // 98 d 14 h 6 min 30 s out

  function startAt(iso: string, reduced = true) {
    vi.useFakeTimers()
    vi.setSystemTime(at(iso))
    const cleanup = initCountdown(stubGsap(reduced)) as () => void
    cleanups.push(cleanup)
    return cleanup
  }

  it('starts nothing on import', async () => {
    vi.useFakeTimers()
    vi.resetModules()
    await import('../../../site/src/modules/countdown.js' as string)
    expect(vi.getTimerCount()).toBe(0)
    expect(text('[data-cd-spoken]')).toBe('')
    expect(q('[data-cd-static]').hidden).toBe(false)
  })

  it('renders days, hours and minutes, and the spoken sentence, before day one', () => {
    startAt(BEFORE)
    expect(text('[data-cd-eyebrow]')).toBe('Day one begins in')
    expect(text('[data-cd-days-digits]')).toBe('98')
    expect(text('[data-cd-days-unit]')).toBe('days')
    expect(clock()).toBe('14:06:30')
    expect(text('[data-cd-spoken]')).toBe('98 days, 14 hours and 6 minutes.')

    expect(q('[data-cd-static]').hidden).toBe(true)
    expect(q('[data-cd-days]').hidden).toBe(false)
    expect(q('[data-cd-clock]').hidden).toBe(false)
    expect(q('[data-cd-ruler]').hidden).toBe(false)
    expect(q('[data-cd-sessions]').hidden).toBe(true)
    expect(q('[data-countdown]').dataset['phase']).toBe('before')
  })

  it('ticks every second with motion on', () => {
    startAt(BEFORE, false)
    expect(q('[data-cd-seconds]').hidden).toBe(false)

    vi.advanceTimersByTime(1000)
    expect(clock()).toBe('14:06:29')

    vi.advanceTimersByTime(30000)
    expect(clock()).toBe('14:05:59')
    expect(text('[data-cd-spoken]')).toBe('98 days, 14 hours and 5 minutes.')
  })

  it('hides seconds and ticks once a minute under reduced motion', () => {
    startAt(BEFORE, true)
    expect(q('[data-cd-seconds]').hidden).toBe(true)

    vi.advanceTimersByTime(1000)
    expect(clock()).toBe('14:06:30')

    // The next whole minute is 30 s away.
    vi.advanceTimersByTime(29000)
    expect(clock()).toBe('14:06:00')
    vi.advanceTimersByTime(60000)
    expect(clock()).toBe('14:05:00')
    expect(text('[data-cd-spoken]')).toBe('98 days, 14 hours and 5 minutes.')
  })

  it('says "day", not "days", with one day left', () => {
    startAt('2027-01-07T19:00:00+05:45')
    expect(text('[data-cd-days-digits]')).toBe('1')
    expect(text('[data-cd-days-unit]')).toBe('day')
    expect(text('[data-cd-spoken]')).toBe('1 day and 5 hours.')
  })

  it('drops the days and keeps the clock in the last 24 hours', () => {
    startAt('2027-01-08T00:00:01+05:45')
    expect(q('[data-countdown]').dataset['phase']).toBe('final')
    expect(text('[data-cd-eyebrow]')).toBe('Day one begins in')
    expect(q('[data-cd-lead]').hidden).toBe(true)
    expect(q('[data-cd-clock]').hidden).toBe(false)
    expect(clock()).toBe('23:59:59')
    expect(text('[data-cd-ref]')).toBe('Counted to midnight tonight in Kathmandu, UTC+5:45.')
  })

  it('holds 00:00:00 at midnight, then hands over to day one', () => {
    startAt('2027-01-08T23:59:58+05:45', false)
    vi.advanceTimersByTime(2000)
    expect(clock()).toBe('00:00:00')
    expect(q('[data-countdown]').dataset['phase']).toBe('final')

    vi.advanceTimersByTime(1000)
    expect(q('[data-countdown]').dataset['phase']).toBe('during')
    expect(text('[data-cd-spoken]')).toBe('Day 1 of 3. Saturday 9 January 2027, Poush 25, 2083 BS.')
  })

  it('hands over to day one under reduced motion too', () => {
    startAt('2027-01-08T23:59:30+05:45', true)
    vi.advanceTimersByTime(31000)
    expect(q('[data-countdown]').dataset['phase']).toBe('during')
    expect(text('[data-cd-day-digits]')).toBe('1')
  })

  it('names day 2 of 3 on 10 January', () => {
    startAt('2027-01-10T12:00:00+05:45')
    expect(text('[data-cd-eyebrow]')).toBe('In session')
    expect(text('[data-cd-day-digits]')).toBe('2')
    expect(text('[data-cd-of]')).toBe('of 3')
    expect(text('[data-cd-spoken]')).toBe('Day 2 of 3. Sunday 10 January 2027, Poush 26, 2083 BS.')
    expect(q('[data-cd-session]').hidden).toBe(false)
    expect(q('[data-cd-clock]').hidden).toBe(true)
    expect(q('[data-cd-sessions]').hidden).toBe(false)

    const today = Array.from(document.querySelectorAll('[data-cd-date]')).map((li) => li.classList.contains('is-today'))
    expect(today).toEqual([false, true, false])
  })

  it('moves to the next day at Kathmandu midnight', () => {
    startAt('2027-01-10T23:59:30+05:45')
    expect(text('[data-cd-day-digits]')).toBe('2')
    vi.advanceTimersByTime(30000)
    expect(text('[data-cd-day-digits]')).toBe('3')
    expect(text('[data-cd-spoken]')).toBe('Day 3 of 3. Monday 11 January 2027, Poush 27, 2083 BS.')
  })

  it('says "Adjourned." from 12 January and schedules nothing further', () => {
    startAt('2027-01-12T00:00:00+05:45')
    expect(text('[data-cd-spoken]')).toBe('Adjourned.')
    expect(text('[data-cd-eyebrow]')).toBe('LRI Model UN X')
    expect(q('[data-cd-adjourned]').hidden).toBe(false)
    expect(q('[data-cd-session]').hidden).toBe(true)
    expect(text('[data-cd-ref]')).toBe('The tenth edition closed on Monday 11 January 2027, Poush 27, 2083 BS.')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('moves from day 3 to "Adjourned." at midnight on the 12th', () => {
    startAt('2027-01-11T23:59:00+05:45')
    vi.advanceTimersByTime(60000)
    expect(text('[data-cd-spoken]')).toBe('Adjourned.')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops updating once cleaned up', () => {
    const cleanup = startAt(BEFORE, false)
    vi.advanceTimersByTime(1000)
    expect(clock()).toBe('14:06:29')

    cleanup()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(120000)
    expect(clock()).toBe('14:06:29')
    expect(text('[data-cd-spoken]')).toBe('98 days, 14 hours and 6 minutes.')
  })

  it('stops while the tab is hidden and jumps to now when it comes back', () => {
    startAt(BEFORE, false)
    let hidden = true
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      expect(vi.getTimerCount()).toBe(0)

      vi.advanceTimersByTime(10000)
      expect(clock()).toBe('14:06:30')

      hidden = false
      document.dispatchEvent(new Event('visibilitychange'))
      expect(clock()).toBe('14:06:20')
      expect(vi.getTimerCount()).toBe(1)
    } finally {
      delete (document as unknown as Record<string, unknown>)['hidden']
    }
  })

  it('waits for the band to be on screen when IntersectionObserver exists, and disconnects on cleanup', () => {
    let fire: (entries: { isIntersecting: boolean }[]) => void = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: typeof fire) {
          fire = cb
        }
        observe() {}
        disconnect = disconnect
      },
    )
    const cleanup = startAt(BEFORE, false)
    expect(clock()).toBe('14:06:30')
    expect(vi.getTimerCount()).toBe(0)

    fire([{ isIntersecting: true }])
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(clock()).toBe('14:06:29')

    fire([{ isIntersecting: false }])
    expect(vi.getTimerCount()).toBe(0)

    cleanup()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  describe('without a usable date, the static copy stays', () => {
    function expectStatic() {
      expect(text('[data-cd-eyebrow]')).toBe('Day one begins')
      expect(text('[data-cd-static]')).toBe('Saturday, at midnight')
      expect(q('[data-cd-static]').hidden).toBe(false)
      expect(text('[data-cd-ref]')).toBe('Kathmandu time, UTC+5:45.')
      expect(q('[data-cd-clock]').hidden).toBe(true)
      expect(q('[data-cd-ruler]').hidden).toBe(true)
      expect(text('[data-cd-spoken]')).toBe('')
      expect(q('[data-countdown]').dataset['phase']).toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
    }

    it('when data-conference-start is removed', () => {
      q('[data-conference-start]').removeAttribute('data-conference-start')
      const cleanup = startAt(BEFORE)
      expectStatic()
      expect(() => cleanup()).not.toThrow()
    })

    it('when data-conference-end is removed', () => {
      q('[data-conference-end]').removeAttribute('data-conference-end')
      startAt(BEFORE)
      expectStatic()
    })

    it('when the start datetime is not a date', () => {
      q('[data-conference-start]').setAttribute('datetime', 'soon')
      startAt(BEFORE)
      expectStatic()
    })
  })
})
