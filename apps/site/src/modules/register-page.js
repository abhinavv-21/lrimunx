import { ACADEMIC_LEVELS, initListbox } from './committee-select.js'
import { initPaymentUpload } from './payment-upload.js'

const API_BASE = String(import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '')
const ENDPOINT = `${API_BASE}/public/register`
const UPLOAD_ENDPOINT = `${API_BASE}/public/blob-upload`

const REQUEST_TIMEOUT_MS = 75000

const REVEAL = { y: 26, ease: 'expo.out', duration: 0.55, stagger: 0.05 }

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
    label: 'Academic level',
    step: 1,
    required: true,
    max: 20,
    focus: '#cs-grade-button',
    messages: {
      required: 'Choose your academic level.',
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

const PAYMENT_FIELD = { name: 'paymentProof', label: 'Payment screenshot' }

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
    copy: 'Several registrations have already been sent from this connection, so the form is holding this one back. On a shared school or home connection that can happen on your first try — there is nothing wrong with your details. Keep this page open, everything you typed is still here, and press Send again in ten or fifteen minutes.',
  },
  offline: {
    title: 'That did not go through',
    copy: 'Your registration did not reach the secretariat. Nothing has been sent and everything you typed is still in the form. If you are online, the server may have been asleep — wait a few seconds and press Send again.',
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
  fallback: 'Uploads are not working. You can send this now and the secretariat will ask for the screenshot by email.',
}

const UPLOAD_FAILURES_BEFORE_FALLBACK = 2

const MISSING_PROOF = 'Add the screenshot of your payment before sending this.'

const UPLOAD_GAVE_UP =
  'The screenshot still could not be uploaded. You can send your registration without it — the secretariat will ask you for it by email.'

const DONE_WITHOUT_PROOF = {
  copy: 'Your details are with the LRI MUN X secretariat. Your payment screenshot did not upload, so it still has to reach them — email it to the address in the footer below, quoting the email address you registered with.',
  proofTitle: 'Send your payment screenshot',
  proofCopy:
    'It could not be uploaded from this page. Email it to the secretariat at the address in the footer; screenshots are matched against the account by hand.',
}

const REFERENCE_FALLBACK = 'Your full name, as entered in step 1'

const RECAP_FALLBACK = {
  name: 'the name you gave in step 1',
  email: 'the email address you gave in step 1',
}

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
  const paymentReference = form.querySelector('[data-regpay-reference]')
  const recapName = form.querySelector('[data-regpay-name]')
  const recapEmail = form.querySelector('[data-regpay-email]')

  const inputs = new Map()
  FIELDS.forEach((field) => {
    const input = form.querySelector(`[name="${field.name}"]`)
    if (input) inputs.set(field.name, input)
  })
  if (!inputs.size) return

  form.setAttribute('action', ENDPOINT)
  form.setAttribute('novalidate', '')

  let step = 1
  let busy = false
  let timer = null

  let dirty = false

  const announce = (message) => {
    if (!live || !message) return

    live.textContent = ''
    window.setTimeout(() => {
      live.textContent = message
    }, 60)
  }

  const fieldWrap = (name) => form.querySelector(`[data-field="${name}"]`)
  const errorEl = (name) => form.querySelector(`[data-error-for="${name}"]`)

  const selectRoot = (id) => form.querySelector(`[data-cselect][data-cselect-id="${id}"]`)

  const gradeSelect = initListbox(selectRoot('cs-grade'), {
    announce,
    options: ACADEMIC_LEVELS,
    allowEmpty: false,
    showCodes: false,
    onSelect: () => markDirty(),
  })

  const primary = initListbox(selectRoot('cs-committeePreference'), {
    announce,
    onSelect: () => {
      markDirty()
      syncPreferences()
    },
  })
  const second = initListbox(selectRoot('cs-committeePreference2'), {
    announce,
    onSelect: () => {
      markDirty()
      syncPreferences()
    },
  })

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

  function applyQueryPreselect() {
    if (!primary) return
    const wanted = new URLSearchParams(window.location.search).get('committee')
    if (!wanted) return
    if (!primary.selectByCode(wanted, { silent: true })) return

    primary.markPreselected(PRESELECT_NOTICE)
    syncPreferences()
  }

  const upload = initPaymentUpload(root.querySelector('[data-upload]'), {
    endpoint: UPLOAD_ENDPOINT,
    announce,
    onChange: () => {
      markDirty()
      reconcileUploadError()
      paintSubmitState()
    },
  })

  function uploadsGivenUp() {
    return (upload?.failures ?? 0) >= UPLOAD_FAILURES_BEFORE_FALLBACK
  }

  function reconcileUploadError() {
    if (!upload || upload.url || !uploadsGivenUp()) return
    upload.setError(UPLOAD_GAVE_UP)
    announce(UPLOAD_GAVE_UP)
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

  function paintPaymentReference() {
    const name = String(inputs.get('fullName')?.value ?? '').trim()
    const email = String(inputs.get('email')?.value ?? '').trim()

    if (paymentReference) paymentReference.textContent = name || REFERENCE_FALLBACK

    if (recapName) recapName.textContent = name || RECAP_FALLBACK.name
    if (recapEmail) recapEmail.textContent = email || RECAP_FALLBACK.email
  }

  function revealPanel(panel) {
    if (reduced || !gsap) return
    const rows = panel.querySelectorAll(
      '.regstep__intro, .regfield, .regpay__recap, .regpay__block, .regstep__foot',
    )
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
    if (step === 2) paintPaymentReference()

    const panel = panels.get(step)
    if (panel) revealPanel(panel)

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

  function setBusy(state) {
    busy = state
    root.classList.toggle('is-submitting', state)
    form.setAttribute('aria-busy', String(state))

    submitLabels.forEach((span) => {
      span.textContent = state ? 'Sending…' : 'Send my registration'
    })

    inputs.forEach((input) => {
      if (input.type !== 'hidden') input.readOnly = state
    })
    gradeSelect?.setReadOnly(state)
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
    const payload = {}
    FIELDS.forEach((field) => {
      const value = values[field.name] ?? ''
      if (!field.required && !value) return
      payload[field.name] = field.integer ? Number(value) : value
    })

    payload.paymentProofUrl = upload?.url ?? ''

    const honeypot = form.querySelector('[name="hp_website"]')
    if (honeypot) payload.hp_website = honeypot.value

    return payload
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (busy) return

    if (step === 1) {
      continueToPayment()
      return
    }

    const values = readValues()
    const errors = validate(values)
    if (errors.size) {
      goTo(1)
      showFieldErrors(errors)
      return
    }

    if (!upload?.url && !uploadsGivenUp()) {
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

  function showDone() {
    if (!done) return

    clearDirty()

    if (!upload?.url) {
      const copy = done.querySelector('[data-regdone-copy]')
      const proofTitle = done.querySelector('[data-regdone-proof-title]')
      const proofCopy = done.querySelector('[data-regdone-proof-copy]')
      if (copy) copy.textContent = DONE_WITHOUT_PROOF.copy
      if (proofTitle) proofTitle.textContent = DONE_WITHOUT_PROOF.proofTitle
      if (proofCopy) proofCopy.textContent = DONE_WITHOUT_PROOF.proofCopy
    }

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

    done.focus()
    if (scrollTo) scrollTo(done)
    ScrollTrigger?.refresh()
  }

  form.addEventListener('submit', onSubmit)
  nextButton?.addEventListener('click', continueToPayment)
  backButton?.addEventListener('click', () => {
    if (busy) return
    goTo(1)
  })

  submit?.addEventListener('click', (event) => {
    if (busy || step === 1 || upload?.url || uploadsGivenUp()) return
    event.preventDefault()
    upload?.setError(MISSING_PROOF)
    announce(LIVE.missingProof)
    upload?.focus()
  })

  inputs.forEach((input, name) => {
    if (input.type === 'hidden') return
    input.addEventListener('input', () => {
      markDirty()
      clearOne(name)
    })
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

  function onBeforeUnload(event) {
    event.preventDefault()
    event.returnValue = ''
    return ''
  }

  function markDirty() {
    if (dirty || busy) return
    dirty = true
    window.addEventListener('beforeunload', onBeforeUnload)
  }

  function clearDirty() {
    if (!dirty) return
    dirty = false
    window.removeEventListener('beforeunload', onBeforeUnload)
  }

  upload?.warm()

  syncPreferences()
  applyQueryPreselect()
  paintSteps()
  paintSubmitState()
}
