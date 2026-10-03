/**
 * The countdown band under the hero.
 *
 * Four states from one clock: before day one it counts down, and in the last
 * 24 hours drops the days and promotes the clock; during the conference it
 * names the day; afterwards it says the session closed. The static HTML is a
 * fifth state, and the one a reader gets if this never runs.
 *
 * The dates come from the hero plinth's two <time> elements, read as midnight
 * in Kathmandu. All the arithmetic is on epoch milliseconds. The dev machines
 * sit in Kathmandu, so anything built on local-time getters would look right
 * here and be wrong for a reader in London.
 */

const DAY_MS = 86400000
const KATHMANDU_MIDNIGHT = 'T00:00:00+05:45'
const RULER_DAYS = 100

const ROLL = 0.68
const ROLL_FAST = 0.42
const ROLL_STAGGER = 0.05

const EYEBROW = {
  before: 'Day one begins in',
  final: 'Day one begins in',
  during: 'In session',
  after: 'LRI Model UN X',
}

const clamp01 = (n) => Math.min(1, Math.max(0, n))
const pad = (n) => String(n).padStart(2, '0')

export function countdownState(nowMs, { startMs, afterMs, anchorMs }) {
  const state = {
    phase: 'before',
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    day: null,
    totalDays: Math.round((afterMs - startMs) / DAY_MS),
    progress: clamp01((nowMs - anchorMs) / (startMs - anchorMs)),
  }

  if (nowMs >= afterMs) return { ...state, phase: 'after' }
  if (nowMs >= startMs) {
    return { ...state, phase: 'during', day: Math.floor((nowMs - startMs) / DAY_MS) + 1 }
  }

  const left = Math.floor((startMs - nowMs) / 1000)
  return {
    ...state,
    phase: startMs - nowMs < DAY_MS ? 'final' : 'before',
    days: Math.floor(left / 86400),
    hours: Math.floor(left / 3600) % 24,
    minutes: Math.floor(left / 60) % 60,
    seconds: left % 60,
  }
}

/**
 * What a screen reader hears. No seconds, so the text only changes once a
 * minute. `dates` is the long form of each conference day, read from the day
 * labels in index.html; without it the during line stops at "Day 2 of 3."
 */
export function spokenCountdown(state, dates = []) {
  if (state.phase === 'after') return 'Adjourned.'

  if (state.phase === 'during') {
    const date = dates[state.day - 1]
    return `Day ${state.day} of ${state.totalDays}.${date ? ` ${date}.` : ''}`
  }

  const parts = [
    [state.days, 'day'],
    [state.hours, 'hour'],
    [state.minutes, 'minute'],
  ]
    .filter(([n]) => n > 0)
    .map(([n, unit]) => `${n} ${unit}${n === 1 ? '' : 's'}`)

  if (!parts.length) return 'Less than a minute.'

  const last = parts.pop()
  return `${parts.length ? `${parts.join(', ')} and ${last}` : last}.`
}

export function initCountdown({ gsap, ScrollTrigger, reduced }) {
  const section = document.querySelector('[data-countdown]')
  const start = document.querySelector('[data-conference-start]')?.getAttribute('datetime')
  const end = document.querySelector('[data-conference-end]')?.getAttribute('datetime')

  const startMs = Date.parse(`${start}${KATHMANDU_MIDNIGHT}`)
  const afterMs = Date.parse(`${end}${KATHMANDU_MIDNIGHT}`) + DAY_MS

  // Without both dates there is nothing true to count to, so the static
  // sentence stays.
  if (!section || Number.isNaN(startMs) || Number.isNaN(afterMs)) return () => {}

  const bounds = { startMs, afterMs, anchorMs: startMs - RULER_DAYS * DAY_MS }

  const $ = (selector) => section.querySelector(selector)
  const inner = $('.countdown__inner')
  const eyebrow = $('[data-cd-eyebrow]')
  const spoken = $('[data-cd-spoken]')
  const lead = $('[data-cd-lead]')
  const daysBlock = $('[data-cd-days]')
  const unit = $('[data-cd-days-unit]')
  const sessionBlock = $('[data-cd-session]')
  const ofTotal = $('[data-cd-of]')
  const adjourned = $('[data-cd-adjourned]')
  const clockEl = $('[data-cd-clock]')
  const ruler = $('[data-cd-ruler]')
  const scale = $('[data-cd-scale]')
  const sessionList = $('[data-cd-sessions]')
  const ref = $('[data-cd-ref]')
  const sessions = Array.from(section.querySelectorAll('[data-cd-date]'))
  const dates = sessions.map((li) => li.dataset.cdDate)

  const days = new Digits($('[data-cd-days-digits]'), gsap)
  const day = new Digits($('[data-cd-day-digits]'), gsap)
  const clock = ['hours', 'minutes', 'seconds'].map(
    (name) => new Digits($(`[data-cd-unit="${name}"]`), gsap, name === 'seconds')
  )

  $('[data-cd-static]').hidden = true
  $('[data-cd-ticks]').innerHTML = '<span></span>'.repeat(11)
  $('[data-cd-seconds]').hidden = reduced

  const midnight = document.createElement('time')
  midnight.dateTime = `${start}${KATHMANDU_MIDNIGHT}`
  midnight.textContent = 'midnight'

  const REF = {
    before: ['Counted to ', midnight, ' in Kathmandu, UTC+5:45.'],
    final: ['Counted to ', midnight, ' tonight in Kathmandu, UTC+5:45.'],
    during: ['Kathmandu time, UTC+5:45.'],
    after: ['The tenth edition closed on ', ...closingDate(dates[dates.length - 1]), '.'],
  }

  let shown = null
  let entered = reduced

  function setPhase(phase) {
    shown = phase
    section.dataset.phase = phase
    eyebrow.textContent = EYEBROW[phase]
    ref.replaceChildren(...REF[phase])

    const counting = phase === 'before' || phase === 'final'
    lead.hidden = phase === 'final'
    daysBlock.hidden = phase !== 'before'
    sessionBlock.hidden = phase !== 'during'
    adjourned.hidden = phase !== 'after'
    clockEl.hidden = !counting
    ruler.hidden = false
    scale.hidden = !counting
    sessionList.hidden = counting
  }

  function render(now, roll) {
    const state = countdownState(now, bounds)
    if (state.phase !== shown) {
      setPhase(state.phase)
      roll = false
    }

    if (state.phase === 'before' || state.phase === 'final') {
      // Right to left, so a tick that changes several digits ripples leftward.
      const values = [state.hours, state.minutes, state.seconds].map(pad)
      let delay = 0
      for (let i = clock.length - 1; i >= 0; i--) delay = clock[i].show(values[i], roll, delay)

      if (state.phase === 'before') {
        days.show(String(state.days), roll, delay)
        unit.textContent = state.days === 1 ? 'day' : 'days'
      }
      if (entered) ruler.style.setProperty('--cd-progress', state.progress)
    } else {
      const elapsed = (now - startMs) / DAY_MS
      day.show(String(state.day ?? state.totalDays), false)
      ofTotal.textContent = `of ${state.totalDays}`
      sessions.forEach((li, i) => {
        li.style.setProperty('--cd-seg', clamp01(elapsed - i))
        li.classList.toggle('is-today', state.phase === 'during' && i === state.day - 1)
      })
    }

    const text = spokenCountdown(state, dates)
    if (spoken.textContent !== text) spoken.textContent = text
  }

  // Ticks land on whole seconds (whole minutes under reduced motion, and
  // during the conference, when nothing on screen moves faster than that).
  let timer = 0
  let hold = 0

  function schedule() {
    clearTimeout(timer)
    if (shown === 'after') return
    const step = reduced || shown === 'during' ? 60000 : 1000
    timer = setTimeout(tick, step - (Date.now() % step))
  }

  function tick() {
    // The timeout fires a few ms after the boundary it was set for; rounding
    // puts the count back on that boundary.
    const now = Math.round(Date.now() / 1000) * 1000

    if ((shown === 'before' || shown === 'final') && now >= startMs) {
      // Midnight. Hold the zeros for a second, then hand over to day one.
      let delay = 0
      for (let i = clock.length - 1; i >= 0; i--) delay = clock[i].show('00', entered && !reduced, delay)
      hold = setTimeout(() => crossfade(() => resume()), 1000)
      return
    }

    render(now, entered && !reduced)
    schedule()
  }

  function crossfade(swap) {
    if (reduced) return swap()
    gsap.to(inner, {
      opacity: 0,
      duration: 0.24,
      ease: 'power1.in',
      onComplete() {
        swap()
        gsap.to(inner, { opacity: 1, duration: 0.24, ease: 'power1.out', clearProps: 'opacity' })
      },
    })
  }

  let onscreen = true

  function stop() {
    clearTimeout(timer)
    clearTimeout(hold)
  }

  // Back on screen or back in the tab: jump straight to now, then tick again.
  function resume() {
    stop()
    if (!onscreen || document.hidden) return
    render(Date.now(), false)
    schedule()
  }

  render(Date.now(), false)

  let observer = null
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      ([entry]) => {
        onscreen = entry.isIntersecting
        if (onscreen) resume()
        else stop()
      },
      { rootMargin: '100px' }
    )
    observer.observe(section)
  } else {
    schedule()
  }

  const onVisibility = () => (document.hidden ? stop() : resume())
  document.addEventListener('visibilitychange', onVisibility)

  // The entrance waits for whichever comes later: the loader lifting, or the
  // band scrolling into view. Per-second rolls start once it has finished.
  let ready = false
  let reached = false
  let timeline = null
  let trigger = null

  const digits = Array.from(lead.querySelectorAll('.countdown__digit'))
  const words = Array.from(lead.querySelectorAll('.countdown__word, .countdown__adjourned'))
  const cells = Array.from(clockEl.children)
  const labels = [ref, ...ruler.querySelectorAll('.label, .countdown__session-bs')]

  function onReady() {
    ready = true
    if (section.getBoundingClientRect().top < window.innerHeight * 0.88) reached = true
    play()
  }

  function play() {
    if (!ready || !reached || timeline) return

    const progress = countdownState(Date.now(), bounds).progress
    timeline = gsap.timeline({
      defaults: { ease: 'expo.out' },
      onComplete() {
        entered = true
        gsap.set([eyebrow, ...digits, ...cells], { clearProps: 'transform' })
      },
    })

    const add = (targets, vars, at) => {
      if (targets.length) timeline.to(targets, vars, at)
    }
    add([eyebrow], { opacity: 1, y: 0, duration: 0.75 }, 0)
    add([eyebrow], { '--rule-scale': 1, duration: 0.66 }, 0.17)
    add(digits, { yPercent: 0, duration: 1, stagger: 0.08 }, 0.25)
    add(cells, { opacity: 1, y: 0, duration: 0.78, stagger: 0.07 }, 0.4)
    add(words, { opacity: 1, duration: 0.6 }, 0.45)
    // GSAP's power2.inOut is the cubic in-out that cubic-bezier(0.65, 0, 0.35, 1) approximates.
    add([ruler], { '--cd-progress': progress, duration: 0.9, ease: 'power2.inOut' }, 0.55)
    add(labels, { opacity: 1, duration: 0.6 }, 0.6)
  }

  if (!reduced) {
    gsap.set(eyebrow, { opacity: 0, y: 26, '--rule-scale': 0 })
    // In the final 24 hours and after, no digits exist; GSAP warns on an empty target.
    if (digits.length) gsap.set(digits, { yPercent: 110 })
    gsap.set(cells, { opacity: 0, y: 26 })
    gsap.set([...words, ...labels], { opacity: 0 })
    ruler.style.setProperty('--cd-progress', 0)

    trigger = ScrollTrigger.create({
      trigger: section,
      start: 'top 88%',
      once: true,
      onEnter() {
        reached = true
        play()
      },
    })

    if (document.documentElement.classList.contains('app-ready')) onReady()
    else document.addEventListener('lri:ready', onReady, { once: true })
  }

  return () => {
    stop()
    observer?.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    document.removeEventListener('lri:ready', onReady)
    trigger?.kill()
    timeline?.kill()
    gsap.killTweensOf([inner, ...section.querySelectorAll('*')])
  }
}

/**
 * One number, one clipped slot per digit. A changed digit rolls: the old one
 * drops out of the slot and the new one drops in from above. A leading digit
 * that is no longer needed (10 days to 9) rolls out while its slot narrows to
 * nothing, so the word after it slides over rather than jumping.
 */
class Digits {
  constructor(el, gsap, fastLast = false) {
    this.el = el
    this.gsap = gsap
    this.fastLast = fastLast
    this.text = ''
  }

  /** Returns the stagger delay for the next slot to the left. */
  show(text, roll, delay = 0) {
    if (text === this.text) return delay

    const moving = this.el.querySelector('.is-moving')
    if (!roll || moving || text.length > this.text.length) {
      this.set(text)
      return delay
    }

    const slots = Array.from(this.el.children)
    const extra = slots.length - text.length
    for (let i = slots.length - 1; i >= 0; i--) {
      const next = text[i - extra]
      if (next === this.text[i]) continue
      const duration = this.fastLast && i === slots.length - 1 ? ROLL_FAST : ROLL
      this.roll(slots[i], next, duration, delay)
      delay += ROLL_STAGGER
    }

    this.text = text
    return delay
  }

  /** No motion. Rewrites digits in place, so an entrance tween on them survives. */
  set(text) {
    const slots = this.el.children
    if (slots.length !== text.length || this.el.querySelector('.is-moving')) {
      if (slots.length) this.gsap.killTweensOf(this.el.querySelectorAll('*'))
      this.el.replaceChildren(...Array.from(text, makeSlot))
    } else {
      Array.from(text).forEach((ch, i) => {
        slots[i].firstElementChild.textContent = ch
      })
    }
    this.text = text
  }

  roll(slot, next, duration, delay) {
    const { gsap } = this
    const out = slot.firstElementChild
    slot.classList.add('is-moving')

    gsap.to(out, {
      yPercent: 100,
      duration,
      delay,
      ease: 'expo.out',
      onComplete() {
        out.remove()
        if (next === undefined) slot.remove()
      },
    })

    if (next === undefined) {
      slot.style.transitionDelay = `${delay}s`
      void slot.offsetWidth
      slot.style.inlineSize = '0px'
      return
    }

    const incoming = makeDigit(next)
    incoming.classList.add('is-incoming')
    slot.append(incoming)
    gsap.fromTo(
      incoming,
      { yPercent: -100 },
      {
        yPercent: 0,
        duration,
        delay,
        ease: 'expo.out',
        onComplete() {
          incoming.classList.remove('is-incoming')
          gsap.set(incoming, { clearProps: 'transform' })
          slot.classList.remove('is-moving')
        },
      }
    )
  }
}

/**
 * "Monday 11 January 2027, Poush 27, 2083 BS" as two unbreakable halves, so the
 * line can only wrap before the date or between the two calendars.
 */
function closingDate(date = '') {
  const split = date.indexOf(', ')
  if (split < 0) return [date]
  const nowrap = (text) => {
    const span = document.createElement('span')
    span.className = 'countdown__nowrap'
    span.textContent = text
    return span
  }
  return [nowrap(date.slice(0, split + 1)), ' ', nowrap(date.slice(split + 2))]
}

function makeDigit(ch) {
  const digit = document.createElement('span')
  digit.className = 'countdown__digit'
  digit.textContent = ch
  return digit
}

function makeSlot(ch) {
  const slot = document.createElement('span')
  slot.className = 'countdown__slot'
  slot.append(makeDigit(ch))
  return slot
}
