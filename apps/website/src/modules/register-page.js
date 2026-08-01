/**
 * register-page.js — the two-step delegate registration form.
 *
 * Successor to the single-panel form that lived on the landing page. What
 * carries over from it is the thinking, not the markup: a real <form> that is
 * upgraded rather than replaced, client validation as a courtesy with the
 * server as the authority, a state machine in which every non-success state
 * leaves the reader's answers untouched, and failures that move focus to the
 * problem rather than reading it out from somewhere else.
 *
 * Responsibilities:
 *   1. The step machine. Step 1 must validate before step 2 opens — nobody
 *      should reach a payment screen and only then be told their email is
 *      wrong. Moving between steps hides and shows; it never rebuilds, so
 *      nothing typed is ever lost, the uploaded screenshot included.
 *   2. Validation, including the one cross-field rule (awards ≤ MUNs).
 *   3. The two committee listboxes and the rule that they cannot hold the same
 *      committee, plus preselection from ?committee=CODE.
 *   4. Submission, and the five outcomes it can have.
 *
 * API contract (fixed — do not renegotiate here):
 *   POST ${API_BASE}/public/register        Content-Type: application/json
 *   201 { status: 'received', reference: '…' }   ← reference deliberately unused
 *   422 { error, code: 422, details }
 *   429 { error, code: 429 }
 */

import { initCommitteeSelect } from './committee-select.js'
import { initPaymentUpload } from './payment-upload.js'

/* -------------------------------------------------------------------------
   Endpoint.

   VITE_API_BASE_URL is the API ROOT, /api/v1 included — the same meaning the
   ops hub gives it, because Vercel builds both bundles in one pass from one set
   of environment variables, and a name that meant two things there would send
   one of them to /api/v1/api/v1.

   It defaults to a same-origin '/api/v1', which is the deployed shape: site and
   API on one domain. Never hardcode a host — the page is built once and dropped
   into whatever the school is serving from. Locally the two are split across
   ports, so .env.development points this at the dev API.

   A trailing slash is stripped so `https://api.example/v1/` and
   `https://api.example/v1` cannot produce a double-slashed path.
   ------------------------------------------------------------------------- */
const API_BASE = String(import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '')
const ENDPOINT = `${API_BASE}/public/register`
const UPLOAD_ENDPOINT = `${API_BASE}/public/blob-upload`

// A request with no ceiling is indistinguishable from a hung one. 20s, then it
// is reported as a connection failure — which, from the reader's side, it is.
const REQUEST_TIMEOUT_MS = 20000

/* The page's reveal language, unchanged: 26px of travel on expo.out. The only
   number that differs is the duration — 1.2s is right for something arriving as
   you scroll towards it, and much too slow for something answering a click. */
const REVEAL = { y: 26, ease: 'expo.out', duration: 0.55, stagger: 0.05 }

/* -------------------------------------------------------------------------
   Field contract.

   Mirrors the API's own rules so the obvious failures never leave the device.
   The lengths are the SERVER's lengths — if they ever diverge the server wins,
   and its 422 is mapped back onto the field regardless. Nothing here is
   STRICTER than the server: a client that rejects what the API would have
   accepted is a client that invents policy.

   `focus` names the element an error should move the reader to. It exists for
   the two committee fields, whose value lives in a hidden <input> that nothing
   can be focused into: the thing to focus is the combobox button beside it.
   ------------------------------------------------------------------------- */
const FIELDS = [
  {
    name: 'fullName',
    label: 'Full name',
    step: 1,
    required: true,
    min: 2,
    max: 120,
    messages: {
      required: 'Enter your full name, as it should appear on your placard.',
      short: 'That looks too short — enter your full name.',
      long: 'That is longer than 120 characters.',
    },
  },
  {
    name: 'email',
    label: 'Email',
    step: 1,
    required: true,
    max: 160,
    // Deliberately permissive. A strict RFC 5322 regex rejects addresses that
    // exist; the server verifies, and this only catches the missing @ and the
    // half-typed domain.
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    messages: {
      required: 'Enter the email address your allocation should go to.',
      pattern:
        'That does not look like an email address — check for a missing @ or a typo in the domain.',
      long: 'That is longer than 160 characters.',
    },
  },
  {
    name: 'phone',
    label: 'Phone',
    step: 1,
    required: true,
    min: 6,
    max: 24,
    pattern: /^[0-9+\-() ]+$/,
    messages: {
      required: 'Enter a number the secretariat can reach you on.',
      short: 'That number is too short — it needs at least 6 characters.',
      long: 'That is longer than 24 characters.',
      pattern: 'Use digits, spaces and + - ( ) only.',
    },
  },
  {
    name: 'schoolName',
    label: 'School',
    step: 1,
    required: true,
    min: 2,
    max: 160,
    messages: {
      required: 'Enter the school you are representing.',
      short: 'That looks too short — enter the full name of your school.',
      long: 'That is longer than 160 characters.',
    },
  },
  {
    name: 'grade',
    label: 'Grade',
    step: 1,
    required: true,
    min: 1,
    max: 20,
    messages: {
      required: 'Enter your grade or year.',
      long: 'That is longer than 20 characters.',
    },
  },
  {
    name: 'munsAttended',
    label: 'MUNs attended',
    step: 1,
    integer: { min: 0, max: 99 },
    messages: { integer: 'Enter a whole number of conferences, between 0 and 99.' },
  },
  {
    name: 'awardsWon',
    label: 'Awards won',
    step: 1,
    integer: { min: 0, max: 99 },
    messages: { integer: 'Enter a whole number of awards, between 0 and 99.' },
  },
  {
    name: 'committeePreference',
    label: 'Committee preference',
    step: 1,
    max: 160,
    focus: '#cs-committeePreference-button',
    messages: { long: 'That is longer than 160 characters.' },
  },
  {
    name: 'committeePreference2',
    label: 'Second preference',
    step: 1,
    max: 160,
    focus: '#cs-committeePreference2-button',
    messages: { long: 'That is longer than 160 characters.' },
  },
  {
    name: 'referralCode',
    label: 'Referral code',
    step: 1,
    max: 40,
    messages: { long: 'That is longer than 40 characters.' },
  },
  {
    name: 'dietaryNotes',
    label: 'Dietary notes',
    step: 1,
    max: 500,
    messages: { long: 'That is longer than 500 characters.' },
  },
  {
    name: 'accessibilityNotes',
    label: 'Accessibility notes',
    step: 1,
    max: 500,
    messages: { long: 'That is longer than 500 characters.' },
  },
]

const FIELD_BY_NAME = new Map(FIELDS.map((field) => [field.name, field]))

/* The upload is not in FIELDS — it has no text value and no length rule — but a
   failure has to be able to name it in the summary like anything else. */
const PAYMENT_FIELD = { name: 'paymentProof', label: 'Payment screenshot' }

/* -------------------------------------------------------------------------
   Copy. Held here rather than in the markup because each string belongs to a
   state, and a string in the markup is a string that can be shown in the wrong
   one. Nothing here says "sent" unless it was.
   ------------------------------------------------------------------------- */
const SUMMARY = {
  invalid: {
    title: 'Check these answers',
    copy: 'Nothing has been sent yet. The answers listed below need attention first.',
  },
  payment: {
    title: 'The payment screenshot is missing',
    copy: 'Registration is only confirmed once the fee is paid, so the screenshot has to be here before this can be sent. Everything you have typed is safe.',
  },
  rejected: {
    title: 'That could not be accepted',
    copy: 'The secretariat could not accept this registration as it stands. Everything you typed is still here.',
  },
  rateLimited: {
    title: 'Too many attempts just now',
    copy: 'Several registrations have been sent from this connection in the last few minutes. There is nothing wrong with your details — wait a minute or two and send it again.',
  },
  offline: {
    title: 'That did not go through',
    copy: 'Your registration could not reach the secretariat — the connection dropped, or this device is offline. Nothing has been sent and everything you typed is still in the form. Try again once you are back online.',
  },
  server: {
    title: 'Something went wrong at our end',
    copy: 'Your registration could not be recorded just now. Nothing you typed has been lost — try again in a moment.',
  },
}

const LIVE = {
  submitting: 'Sending your registration.',
  invalid: 'Your registration was not sent. The errors are listed at the top of the form.',
  step1: 'Step 1 of 2: delegate details.',
  step2: 'Step 2 of 2: payment.',
  missingProof: 'Your payment screenshot is missing. Add it to send your registration.',
}

const STEP_STATE = {
  done: 'Complete',
  current: 'In progress',
  waiting: 'Not started',
}

const PRESELECT_NOTICE =
  'Chosen for you from the committees list. Change it here if you would rather sit somewhere else.'

const SUBMIT_NOTE = {
  blocked: 'Add your payment screenshot to finish.',
  ready: 'This sends your registration to the secretariat.',
  sending: 'Sending — do not close this page.',
  /**
   * Offered only after uploads have failed twice.
   *
   * Requiring the screenshot is right when uploading works. When it does not —
   * a store that is not configured yet, a captive-portal network, a phone on
   * one bar — an unconditional requirement means nobody can register at all,
   * and a registration form that cannot be submitted is worse than one missing
   * an attachment the secretariat can ask for later.
   */
  fallback: 'Uploads are not working. You can send this now and the secretariat will ask for the screenshot by email.',
}

/** Failed attempts before the send-anyway path appears. */
const UPLOAD_FAILURES_BEFORE_FALLBACK = 2

const MISSING_PROOF = 'Add the screenshot of your payment before sending this.'

export function initRegisterPage({ gsap, ScrollTrigger, reduced, scrollTo } = {}) {
  const root = document.querySelector('[data-register]')
  if (!root) return

  const form = root.querySelector('[data-register-form]')
  if (!form) return

  const steps = root.querySelector('[data-steps]')
  const panels = new Map(
    Array.from(form.querySelectorAll('[data-step-panel]')).map((el) => [
      Number(el.dataset.stepPanel),
      el,
    ])
  )
  const markers = new Map(
    Array.from(root.querySelectorAll('[data-step-marker]')).map((el) => [
      Number(el.dataset.stepMarker),
      el,
    ])
  )
  const legends = new Map(
    Array.from(form.querySelectorAll('[data-step-legend]')).map((el) => [
      Number(el.dataset.stepLegend),
      el,
    ])
  )

  const nextButton = form.querySelector('[data-step-next]')
  const backButton = form.querySelector('[data-step-back]')
  const submit = form.querySelector('[data-register-submit]')
  const submitLabels = form.querySelectorAll('[data-register-submit-label] > span')
  const submitNote = form.querySelector('[data-submit-note]')
  const summary = form.querySelector('[data-register-summary]')
  const summaryTitle = form.querySelector('[data-register-summary-title]')
  const summaryCopy = form.querySelector('[data-register-summary-copy]')
  const summaryList = form.querySelector('[data-register-summary-list]')
  const live = root.querySelector('[data-register-live]')
  const done = root.querySelector('[data-register-done]')

  const inputs = new Map()
  FIELDS.forEach((field) => {
    const input = form.querySelector(`[name="${field.name}"]`)
    if (input) inputs.set(field.name, input)
  })
  if (!inputs.size) return

  /* --------------------------------------------------------------------
     Progressive enhancement. The markup ships with a same-origin action and
     method="post", so it is a real form before this file runs. Exactly two
     things change here: the action is repointed at the configured API base,
     and native validation is suppressed, because the browser's bubbles are
     not announced consistently and cannot be styled onto this ground.
     -------------------------------------------------------------------- */
  form.setAttribute('action', ENDPOINT)
  form.setAttribute('novalidate', '')

  let step = 1
  let busy = false
  let timer = null

  const announce = (message) => {
    if (!live || !message) return
    // Cleared first: two identical consecutive strings are not re-announced.
    live.textContent = ''
    window.setTimeout(() => {
      live.textContent = message
    }, 60)
  }

  const fieldWrap = (name) => form.querySelector(`[data-field="${name}"]`)
  const errorEl = (name) => form.querySelector(`[data-error-for="${name}"]`)

  /* --------------------------------------------------------------------
     The committee listboxes, and the rule that they cannot agree.
     -------------------------------------------------------------------- */
  const selectRoots = Array.from(form.querySelectorAll('[data-cselect]'))
  const primary = initCommitteeSelect(selectRoots[0], {
    announce,
    onSelect: () => syncPreferences(),
  })
  const second = initCommitteeSelect(selectRoots[1], {
    announce,
    onSelect: () => syncPreferences(),
  })

  /**
   * Keep the two preferences distinct.
   *
   * The blocked option is left in place, marked aria-disabled, with the reason
   * printed on it — an option that vanishes when you pick its twin looks like a
   * bug, and the reader is left doubting what they saw a moment ago.
   *
   * If the collision is created from the primary side, the second preference is
   * cleared and SAYS SO. Silently rewriting somebody's answer is worse than
   * either alternative.
   */
  function syncPreferences() {
    if (!primary || !second) return

    if (primary.code && primary.code === second.code) {
      second.clear({
        reason: `Second preference cleared — ${primary.code} is now your first preference.`,
      })
    }

    second.blockCode(primary.code, 'already your first preference')
    primary.blockCode(second.code, 'already your second preference')
  }

  /* --------------------------------------------------------------------
     Preselection from ?committee=UNSC — the Apply button on a committee card.
     An unknown or absent code degrades to nothing selected: it is a
     convenience, and a convenience that can fail loudly is not one.
     -------------------------------------------------------------------- */
  function applyQueryPreselect() {
    if (!primary) return
    const wanted = new URLSearchParams(window.location.search).get('committee')
    if (!wanted) return
    if (!primary.selectByCode(wanted, { silent: true })) return

    primary.markPreselected(PRESELECT_NOTICE)
    fieldWrap('committeePreference')?.classList.add('is-preselected')
    syncPreferences()
  }

  /* --------------------------------------------------------------------
     The payment upload.
     -------------------------------------------------------------------- */
  const upload = initPaymentUpload(root.querySelector('[data-upload]'), {
    endpoint: UPLOAD_ENDPOINT,
    announce,
    onChange: () => paintSubmitState(),
  })

  /** True once uploading has failed enough times to stop being the only route. */
  function uploadsGivenUp() {
    return (upload?.failures ?? 0) >= UPLOAD_FAILURES_BEFORE_FALLBACK
  }

  function paintSubmitState() {
    if (!submit) return
    const uploaded = Boolean(upload?.url)
    const ready = uploaded || uploadsGivenUp()
    submit.setAttribute('aria-disabled', String(!ready || busy))
    root.classList.toggle('is-ready', ready)
    if (submitNote) {
      submitNote.textContent = busy
        ? SUBMIT_NOTE.sending
        : uploaded
          ? SUBMIT_NOTE.ready
          : ready
            ? SUBMIT_NOTE.fallback
            : SUBMIT_NOTE.blocked
    }
  }

  /* --------------------------------------------------------------------
     Validation. Length and shape only — every rule here exists on the server
     too, and this pass is a courtesy, not a gate.
     -------------------------------------------------------------------- */
  function readValues() {
    const values = {}
    inputs.forEach((input, name) => {
      values[name] = String(input.value ?? '').trim()
    })
    return values
  }

  function checkOne(field, value) {
    if (!value) return field.required ? field.messages.required : null
    if (field.integer) {
      if (!/^\d{1,2}$/.test(value)) return field.messages.integer
      const n = Number(value)
      if (n < field.integer.min || n > field.integer.max) return field.messages.integer
      return null
    }
    if (field.min && value.length < field.min) return field.messages.short ?? field.messages.required
    if (field.max && value.length > field.max) return field.messages.long
    if (field.pattern && !field.pattern.test(value)) return field.messages.pattern
    return null
  }

  /**
   * The one rule that spans two fields: you cannot have won an award at a
   * conference you did not attend.
   *
   * Checked only when BOTH numbers are answered, which is exactly the condition
   * the server's own superRefine uses — either one alone is legitimate, and a
   * client that refused what the API accepts would be inventing policy.
   *
   * Reported against awardsWon, because that is the number to lower. The other
   * reading — "they under-counted their conferences" — is not ours to guess at.
   */
  function checkAwards(values, errors) {
    if (errors.has('awardsWon') || errors.has('munsAttended')) return

    const muns = values.munsAttended ?? ''
    const awards = values.awardsWon ?? ''
    if (!muns || !awards) return

    if (Number(awards) > Number(muns)) {
      errors.set(
        'awardsWon',
        `You cannot have won more awards than the conferences you have sat in. You entered ${muns} ${
          Number(muns) === 1 ? 'conference' : 'conferences'
        }.`
      )
    }
  }

  function validate(values, forStep = null) {
    const errors = new Map()
    FIELDS.forEach((field) => {
      if (!inputs.has(field.name)) return
      if (forStep && field.step !== forStep) return
      const message = checkOne(field, values[field.name] ?? '')
      if (message) errors.set(field.name, message)
    })
    checkAwards(values, errors)
    return errors
  }

  /* --------------------------------------------------------------------
     Error presentation.

     The summary takes FOCUS rather than being a live region. Focus both moves
     the reader to the problem and reads it out; a live region only reads it and
     leaves them wherever they were, which on a form this long is several
     screens from the field that failed.
     -------------------------------------------------------------------- */
  function focusTargetFor(name) {
    const field = FIELD_BY_NAME.get(name)
    if (field?.focus) return form.querySelector(field.focus)
    return inputs.get(name) ?? null
  }

  function labelFor(name) {
    if (name === PAYMENT_FIELD.name) return PAYMENT_FIELD.label
    return FIELD_BY_NAME.get(name)?.label ?? name
  }

  function clearErrors() {
    FIELDS.forEach((field) => {
      fieldWrap(field.name)?.classList.remove('is-invalid')
      inputs.get(field.name)?.removeAttribute('aria-invalid')
      const error = errorEl(field.name)
      if (error) error.textContent = ''
    })
    upload?.setError('')
    if (summary) summary.hidden = true
    if (summaryList) summaryList.textContent = ''
  }

  function clearOne(name) {
    const wrap = fieldWrap(name)
    if (!wrap?.classList.contains('is-invalid')) return
    wrap.classList.remove('is-invalid')
    inputs.get(name)?.removeAttribute('aria-invalid')
    const error = errorEl(name)
    if (error) error.textContent = ''
  }

  function showSummary({ title, copy }, entries = []) {
    if (!summary) return
    if (summaryTitle) summaryTitle.textContent = title
    if (summaryCopy) summaryCopy.textContent = copy

    if (summaryList) {
      summaryList.textContent = ''
      entries.forEach(([name, message]) => {
        const item = document.createElement('li')
        const jump = document.createElement('button')
        jump.type = 'button'
        jump.className = 'regform__summary-jump'
        // A <button>, not an <a href="#id">. The delegated anchor handler in
        // register-main.js sets tabindex="-1" on whatever a hash link targets —
        // on an <input> that silently removes the field from the tab order.
        jump.textContent = `${labelFor(name)}: ${message}`
        jump.addEventListener('click', () => {
          if (name === PAYMENT_FIELD.name) {
            upload?.focus()
            return
          }
          const target = focusTargetFor(name)
          target?.focus()
          target?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
        })
        item.append(jump)
        summaryList.append(item)
      })
    }

    summary.hidden = false
    summary.focus()
  }

  function showFieldErrors(errors) {
    clearErrors()
    errors.forEach((message, name) => {
      fieldWrap(name)?.classList.add('is-invalid')
      inputs.get(name)?.setAttribute('aria-invalid', 'true')
      const error = errorEl(name)
      if (error) error.textContent = message
    })
    showSummary(SUMMARY.invalid, Array.from(errors.entries()))
    announce(LIVE.invalid)
  }

  /**
   * Map a 422 `details` payload back onto fields.
   *
   * The contract fixes the envelope but not the shape of `details`, so this is
   * deliberately tolerant of the three shapes a validation layer normally
   * emits: a flat `{ field: message }` map, a zod-style
   * `{ fieldErrors: { field: [message] } }`, and an array of
   * `{ field | name | path, message }` — which is what this API's own validate
   * middleware sends. Anything it cannot place falls through to the summary as
   * a whole-form message, so a 422 is never silently swallowed.
   */
  function mapDetails(details) {
    const errors = new Map()
    if (!details || typeof details !== 'object') return errors

    const source = details.fieldErrors ?? details.errors ?? details

    const put = (rawName, rawMessage) => {
      const name = String(rawName ?? '')
      if (!inputs.has(name) || errors.has(name)) return
      const message = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage
      if (typeof message !== 'string' || !message) return
      errors.set(name, message)
    }

    if (Array.isArray(source)) {
      source.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return
        const path = entry.field ?? entry.name ?? entry.path
        put(Array.isArray(path) ? path[0] : path, entry.message ?? entry.error)
      })
      return errors
    }

    Object.entries(source).forEach(([key, value]) => put(key, value))
    return errors
  }

  /* --------------------------------------------------------------------
     The step machine.

     Steps are hidden and shown, never built and torn down. Everything typed
     survives a trip back to step 1 and forward again — the uploaded screenshot
     included — because none of it is ever removed from the document. Losing a
     filled form is the worst thing this page can do.
     -------------------------------------------------------------------- */
  function paintSteps() {
    markers.forEach((marker, index) => {
      const state = index < step ? 'done' : index === step ? 'current' : 'waiting'
      marker.classList.toggle('is-current', state === 'current')
      marker.classList.toggle('is-done', state === 'done')
      if (state === 'current') marker.setAttribute('aria-current', 'step')
      else marker.removeAttribute('aria-current')
      const stateEl = marker.querySelector('[data-step-state]')
      if (stateEl) stateEl.textContent = STEP_STATE[state]
    })
  }

  function revealPanel(panel) {
    if (reduced || !gsap) return
    const rows = panel.querySelectorAll('.regstep__intro, .regfield, .regpay__block, .regstep__foot')
    if (!rows.length) return
    gsap.fromTo(
      rows,
      { opacity: 0, y: REVEAL.y },
      {
        opacity: 1,
        y: 0,
        duration: REVEAL.duration,
        ease: REVEAL.ease,
        stagger: REVEAL.stagger,
        overwrite: true,
        clearProps: 'transform,opacity',
      }
    )
  }

  function goTo(next) {
    if (next === step || !panels.has(next)) return
    step = next

    panels.forEach((panel, index) => {
      panel.hidden = index !== step
    })

    paintSteps()

    const panel = panels.get(step)
    if (panel) revealPanel(panel)

    // The step heading takes focus, so a screen-reader user is placed at the
    // top of the new step rather than left on a button that has just been
    // hidden. Scrolling is separate, and goes to the INDICATOR rather than the
    // heading, so the progress marks are on screen at the moment they change.
    legends.get(step)?.focus({ preventScroll: true })
    if (steps && scrollTo) scrollTo(steps)
    else steps?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })

    announce(step === 2 ? LIVE.step2 : LIVE.step1)

    if (step === 2) upload?.warm()
    ScrollTrigger?.refresh()
  }

  function continueToPayment() {
    const errors = validate(readValues(), 1)
    if (errors.size) {
      showFieldErrors(errors)
      return
    }
    clearErrors()
    goTo(2)
  }

  /* --------------------------------------------------------------------
     Submitting.

     `busy` is checked before anything else and set before any await, so a
     double click, a double tap and Enter-held-down all collapse into one
     request. The submit button is aria-disabled rather than disabled:
     `disabled` throws focus back to <body>, which on a form this tall leaves a
     keyboard user at the top of the document with no idea what happened.
     -------------------------------------------------------------------- */
  function setBusy(state) {
    busy = state
    root.classList.toggle('is-submitting', state)
    form.setAttribute('aria-busy', String(state))

    submitLabels.forEach((span) => {
      span.textContent = state ? 'Sending…' : 'Send my registration'
    })

    // read-only, not disabled — same reasoning as the button.
    inputs.forEach((input) => {
      if (input.type !== 'hidden') input.readOnly = state
    })
    primary?.setReadOnly(state)
    second?.setReadOnly(state)
    upload?.setReadOnly(state)
    backButton?.setAttribute('aria-disabled', String(state))

    paintSubmitState()
  }

  async function send(payload) {
    const controller = new AbortController()
    timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      return await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } finally {
      window.clearTimeout(timer)
      timer = null
    }
  }

  function buildPayload(values) {
    // Empty optional fields are omitted rather than sent as empty strings, so
    // the API is never asked to distinguish "no dietary requirements" from
    // "left blank" — it is the same thing.
    const payload = {}
    FIELDS.forEach((field) => {
      const value = values[field.name] ?? ''
      if (!field.required && !value) return
      payload[field.name] = field.integer ? Number(value) : value
    })

    payload.paymentProofUrl = upload?.url ?? ''

    // The honeypot rides along. The server is the authority on what to do with
    // a filled one; short-circuiting here would only teach a bot where the trap
    // is.
    const honeypot = form.querySelector('[name="hp_website"]')
    if (honeypot) payload.hp_website = honeypot.value

    return payload
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (busy) return

    // Enter pressed inside a step-1 field submits the form in every browser,
    // because the form has a submit button somewhere in it. On step 1 that
    // keystroke means "next", and it must never mean "send".
    if (step === 1) {
      continueToPayment()
      return
    }

    const values = readValues()
    const errors = validate(values)
    if (errors.size) {
      // Back to the step the failures are on FIRST, then report them — goTo
      // moves focus to the step heading, and doing it the other way round would
      // take focus straight back off the summary.
      goTo(1)
      showFieldErrors(errors)
      return
    }

    if (!upload?.url) {
      clearErrors()
      upload?.setError(MISSING_PROOF)
      showSummary(SUMMARY.payment, [[PAYMENT_FIELD.name, 'Upload the screenshot of your payment.']])
      return
    }

    clearErrors()
    setBusy(true)
    announce(LIVE.submitting)

    let response
    try {
      response = await send(buildPayload(values))
    } catch {
      // Network failure, DNS failure, CORS rejection or the 20s abort. All of
      // them mean the same thing to the reader: it did not arrive.
      setBusy(false)
      showSummary(SUMMARY.offline)
      return
    }

    let data = null
    try {
      data = await response.json()
    } catch {
      data = null
    }

    setBusy(false)

    if (response.status === 201 || (response.ok && data?.status === 'received')) {
      // `data.reference` is deliberately ignored. The reader is told what
      // happens next, not handed a code to keep — and the API answers a repeat
      // submission with the same shape, so a reference on screen would raise a
      // question ("is this a new one?") that the page cannot answer.
      showDone()
      return
    }

    if (response.status === 422) {
      const mapped = mapDetails(data?.details)
      if (mapped.size) {
        if (Array.from(mapped.keys()).some((name) => FIELD_BY_NAME.get(name)?.step === 1)) goTo(1)
        showFieldErrors(mapped)
      } else {
        showSummary({
          title: SUMMARY.rejected.title,
          copy: typeof data?.error === 'string' && data.error ? data.error : SUMMARY.rejected.copy,
        })
      }
      return
    }

    if (response.status === 429) {
      showSummary(SUMMARY.rateLimited)
      return
    }

    showSummary(SUMMARY.server)
  }

  /* --------------------------------------------------------------------
     The thank-you.

     It replaces the form AND the step indicator. Leaving "Step 2 of 2 — in
     progress" standing above a success message is a small lie about where the
     reader is, and thirteen filled-in answers under it invite a second
     submission.
     -------------------------------------------------------------------- */
  function showDone() {
    if (!done) return

    form.hidden = true
    if (steps) steps.hidden = true
    done.hidden = false

    if (!reduced && gsap) {
      gsap.fromTo(
        done.querySelectorAll(
          '.regdone__eyebrow, .regdone__title, .regdone__copy, .regdone__next li, .regdone__foot, .regdone__cta'
        ),
        { opacity: 0, y: REVEAL.y },
        {
          opacity: 1,
          y: 0,
          duration: 1.2,
          ease: REVEAL.ease,
          stagger: 0.075,
          clearProps: 'transform,opacity',
        }
      )
    }

    // Focus, rather than a live region: this is now the whole content of the
    // page, and focus both announces it and puts the reader inside it.
    done.focus()
    if (scrollTo) scrollTo(done)
    ScrollTrigger?.refresh()
  }

  /* --------------------------------------------------------------------
     Wiring.
     -------------------------------------------------------------------- */
  form.addEventListener('submit', onSubmit)
  nextButton?.addEventListener('click', continueToPayment)
  backButton?.addEventListener('click', () => {
    if (busy) return
    goTo(1)
  })

  // The blocked submit is not dead: it explains itself and sends the reader to
  // the thing that is missing. A greyed-out control that does nothing when you
  // press it is the least helpful state a form can hold.
  submit?.addEventListener('click', (event) => {
    if (busy || upload?.url || uploadsGivenUp()) return
    event.preventDefault()
    upload?.setError(MISSING_PROOF)
    announce(LIVE.missingProof)
    upload?.focus()
  })

  // A field that has been corrected stops shouting as soon as it is corrected,
  // and is re-checked on the way out. Validating on every keystroke tells
  // somebody their email is invalid while they are still typing the @.
  inputs.forEach((input, name) => {
    if (input.type === 'hidden') return
    input.addEventListener('input', () => clearOne(name))
    input.addEventListener('blur', () => {
      if (busy) return
      const field = FIELD_BY_NAME.get(name)
      if (!field) return
      const message = checkOne(field, String(input.value ?? '').trim())
      if (!message) return
      fieldWrap(name)?.classList.add('is-invalid')
      input.setAttribute('aria-invalid', 'true')
      const error = errorEl(name)
      if (error) error.textContent = message
    })
  })

  syncPreferences()
  applyQueryPreselect()
  paintSteps()
  paintSubmitState()
}
