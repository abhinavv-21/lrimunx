/**
 * register.js — the inline delegate registration form.
 *
 * The panel used to hand the reader off to a Google Form in a new tab. It now
 * takes the registration on the page and posts it straight to the conference
 * API, so the conversion point is where the conversion happens.
 *
 * Responsibilities:
 *   1. Upgrade a real, working <form> — it ships with action/method and is
 *      submitted with fetch only because JS is present, not instead of.
 *   2. Client-side validation, purely to save a round trip. The server is the
 *      authority and a 422 is always handled, even when the client passed.
 *   3. A seven-state machine: idle · submitting · received · duplicate ·
 *      invalid · rate-limited · offline. Every non-success state leaves the
 *      reader's answers in the form and never implies the opposite.
 *   4. Announcing all of it: focus moves to the error summary, transient
 *      status goes through a polite live region, fields carry aria-invalid
 *      and aria-describedby.
 *
 * API contract (fixed — do not renegotiate here):
 *   POST ${API_BASE}/public/register          Content-Type: application/json
 *   201 { status: 'received',  reference: 'LMX-7Q4H2M' }
 *   200 { status: 'duplicate', reference: 'LMX-7Q4H2M' }
 *   422 { error, code: 422, details }
 *   429 { error, code: 429 }
 */

/* -------------------------------------------------------------------------
   Endpoint.

   VITE_API_BASE_URL is the API ROOT, /api/v1 included — the same meaning the
   ops hub gives it, because Vercel builds both bundles in one pass from one
   set of environment variables, and a name that meant two things there would
   send one of them to /api/v1/api/v1.

   It defaults to a same-origin '/api/v1', which is the deployed shape: site
   and API on one domain. Never hardcode a host — the page is built once and
   dropped into whatever the school is serving from. Locally the two are split
   across ports, so .env.development points this at the dev API.

   A trailing slash is stripped so `https://api.example/v1/` and
   `https://api.example/v1` cannot produce a double-slashed path.
   ------------------------------------------------------------------------- */
const API_BASE = String(import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '')
const ENDPOINT = `${API_BASE}/public/register`

// A request with no ceiling is indistinguishable from a hung one. 20s, then it
// is reported as a connection failure — which, from the reader's side, it is.
const REQUEST_TIMEOUT_MS = 20000

// The page's one set of reveal numbers. Same four as main.js: nothing here
// invents an easing curve or a distance.
const REVEAL = { start: 'top 94%', y: 26, duration: 1.2, ease: 'expo.out', stagger: 0.075 }

/* -------------------------------------------------------------------------
   Field contract.

   Mirrors the API's own rules so the obvious failures never leave the device.
   The lengths are the SERVER's lengths — if they ever diverge, the server wins
   and its 422 is mapped back onto the field regardless.
   ------------------------------------------------------------------------- */
const FIELDS = [
  {
    name: 'fullName',
    label: 'Full name',
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
    required: true,
    max: 160,
    // Deliberately permissive. A strict RFC 5322 regex rejects addresses that
    // exist; the server verifies, this only catches the missing @ and the
    // half-typed domain.
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    messages: {
      required: 'Enter the email address your allocation should go to.',
      pattern: 'That does not look like an email address — check for a missing @ or a typo in the domain.',
      long: 'That is longer than 160 characters.',
    },
  },
  {
    name: 'phone',
    label: 'Phone',
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
    required: true,
    min: 1,
    max: 20,
    messages: {
      required: 'Enter your grade or year.',
      long: 'That is longer than 20 characters.',
    },
  },
  {
    name: 'committeePreference',
    label: 'Committee preference',
    max: 160,
    messages: { long: 'That is longer than 160 characters.' },
  },
  {
    name: 'dietaryNotes',
    label: 'Dietary notes',
    max: 500,
    messages: { long: 'That is longer than 500 characters.' },
  },
  {
    name: 'accessibilityNotes',
    label: 'Accessibility notes',
    max: 500,
    messages: { long: 'That is longer than 500 characters.' },
  },
]

const FIELD_BY_NAME = new Map(FIELDS.map((field) => [field.name, field]))

/* -------------------------------------------------------------------------
   Copy.

   Held here rather than in the markup because there are two variants of the
   same block and the receipt is built at runtime — the same reason oc.js and
   gallery.js hold their content. Every string is written to be true in the
   state it belongs to: a failed submission never says "sent", and the
   duplicate state is warm, because a delegate registering twice has done
   nothing wrong.
   ------------------------------------------------------------------------- */
const RECEIPT = {
  received: {
    eyebrow: 'Registration received',
    title: 'Your registration is in.',
    copy: 'The LRI MUN X secretariat has your details. Committee and country allocations are released by email once registration closes.',
    next: 'Nothing else is needed from you now. Keep the reference — it is how the secretariat finds your entry if anything needs correcting.',
  },
  duplicate: {
    eyebrow: 'Already registered',
    title: 'You are already on the list.',
    copy: 'This email is already registered for LRI MUN X, so nothing has been entered twice. Here is the same reference again — it has not changed.',
    next: 'If you did not register yourself, or the details held against this email are wrong, contact the secretariat quoting this reference.',
  },
}

const SUMMARY = {
  invalid: {
    title: 'Check these answers',
    copy: 'Nothing has been sent yet. The answers listed below need attention first.',
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
  copied: 'Reference copied to the clipboard.',
}

export function initRegister({ gsap, ScrollTrigger, reduced } = {}) {
  const root = document.querySelector('[data-register]')
  if (!root) return

  const form = root.querySelector('[data-register-form]')
  if (!form) return

  const submit = form.querySelector('[data-register-submit]')
  const submitLabels = form.querySelectorAll('[data-register-submit-label] > span')
  const summary = form.querySelector('[data-register-summary]')
  const summaryTitle = form.querySelector('[data-register-summary-title]')
  const summaryCopy = form.querySelector('[data-register-summary-copy]')
  const summaryList = form.querySelector('[data-register-summary-list]')
  const live = root.querySelector('[data-register-live]')
  const receipt = root.querySelector('[data-register-receipt]')
  const copyButton = root.querySelector('[data-register-copy]')

  const inputs = new Map()
  FIELDS.forEach((field) => {
    const input = form.querySelector(`[name="${field.name}"]`)
    if (input) inputs.set(field.name, input)
  })
  if (!inputs.size) return

  /* --------------------------------------------------------------------
     Progressive enhancement.

     The markup ships with a same-origin action and method="post", so the
     control is a real form before this file runs. Two upgrades happen here
     and nowhere else, which is what keeps the no-JS path honest:
       · the action is repointed at the configured API base
       · native validation is suppressed, because the browser's bubbles are
         not announced consistently and cannot be styled onto this ground
     -------------------------------------------------------------------- */
  form.setAttribute('action', ENDPOINT)
  form.setAttribute('novalidate', '')

  let busy = false
  let timer = null

  const announce = (message) => {
    if (!live) return
    // Cleared first: two identical consecutive strings are not re-announced.
    live.textContent = ''
    window.setTimeout(() => {
      live.textContent = message
    }, 60)
  }

  const fieldWrap = (name) => form.querySelector(`[data-field="${name}"]`)
  const errorEl = (name) => form.querySelector(`[data-error-for="${name}"]`)

  /* --------------------------------------------------------------------
     Validation. Length and shape only — every rule here exists on the
     server too, and this pass is a courtesy, not a gate.
     -------------------------------------------------------------------- */
  function readValues() {
    const values = {}
    inputs.forEach((input, name) => {
      values[name] = input.value.trim()
    })
    return values
  }

  function checkOne(field, value) {
    if (!value) return field.required ? field.messages.required : null
    if (field.min && value.length < field.min) return field.messages.short ?? field.messages.required
    if (field.max && value.length > field.max) return field.messages.long
    if (field.pattern && !field.pattern.test(value)) return field.messages.pattern
    return null
  }

  function validate(values) {
    const errors = new Map()
    FIELDS.forEach((field) => {
      if (!inputs.has(field.name)) return
      const message = checkOne(field, values[field.name] ?? '')
      if (message) errors.set(field.name, message)
    })
    return errors
  }

  /* --------------------------------------------------------------------
     Error presentation.

     The summary takes FOCUS rather than being a live region. Focus both
     moves the reader to the problem and reads it out; a live region only
     reads it and leaves them wherever they were, which on a form this long
     is several screens from the field that failed.
     -------------------------------------------------------------------- */
  function clearErrors() {
    inputs.forEach((input, name) => {
      const wrap = fieldWrap(name)
      const error = errorEl(name)
      wrap?.classList.remove('is-invalid')
      input.removeAttribute('aria-invalid')
      if (error) error.textContent = ''
    })
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
        // main.js sets tabindex="-1" on whatever a hash link targets — on an
        // <input> that silently removes the field from the tab order.
        jump.textContent = `${FIELD_BY_NAME.get(name)?.label ?? name}: ${message}`
        jump.addEventListener('click', () => {
          const input = inputs.get(name)
          input?.focus()
          input?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
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
      const wrap = fieldWrap(name)
      const error = errorEl(name)
      wrap?.classList.add('is-invalid')
      inputs.get(name)?.setAttribute('aria-invalid', 'true')
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
   * `{ field | path, message }`. Anything it cannot place falls through to the
   * summary as a whole-form message, so a 422 is never silently swallowed.
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
     Submitting.

     `busy` is checked before anything else and set before any await, so a
     double click, a double tap and Enter-held-down all collapse into one
     request. The submit button is aria-disabled rather than disabled:
     `disabled` throws focus back to <body>, which on a panel this tall
     leaves a keyboard user at the top of the document with no idea what
     just happened.
     -------------------------------------------------------------------- */
  function setBusy(state) {
    busy = state
    root.classList.toggle('is-submitting', state)
    form.setAttribute('aria-busy', String(state))

    if (submit) {
      submit.setAttribute('aria-disabled', String(state))
      submitLabels.forEach((span) => {
        span.textContent = state ? 'Sending…' : 'Send my registration'
      })
    }

    // read-only, not disabled — same reasoning as the button.
    inputs.forEach((input) => {
      input.readOnly = state
    })
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

  async function onSubmit(event) {
    event.preventDefault()
    if (busy) return

    const values = readValues()
    const clientErrors = validate(values)
    if (clientErrors.size) {
      showFieldErrors(clientErrors)
      return
    }

    clearErrors()
    setBusy(true)
    announce(LIVE.submitting)

    // Empty optional fields are omitted rather than sent as empty strings, so
    // the API is never asked to distinguish "no dietary requirements" from
    // "left blank" — it is the same thing.
    const payload = {}
    FIELDS.forEach((field) => {
      const value = values[field.name] ?? ''
      if (field.required || value) payload[field.name] = value
    })
    // The honeypot rides along. The server is the authority on what to do with
    // a filled one; short-circuiting here would only teach a bot where the
    // trap is.
    const honeypot = form.querySelector('[name="hp_website"]')
    if (honeypot) payload.hp_website = honeypot.value

    let response
    try {
      response = await send(payload)
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
      showReceipt('received', data?.reference)
      return
    }

    if (response.status === 200 || data?.status === 'duplicate') {
      showReceipt('duplicate', data?.reference)
      return
    }

    if (response.status === 422) {
      const mapped = mapDetails(data?.details)
      if (mapped.size) {
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
     The receipt.

     The form is replaced, not appended to. Eight filled-in fields sitting
     under a success message invite a second submission and make it look as
     though nothing was consumed.
     -------------------------------------------------------------------- */
  function showReceipt(variant, reference) {
    if (!receipt) return
    const copy = RECEIPT[variant] ?? RECEIPT.received

    const set = (selector, text) => {
      const el = receipt.querySelector(selector)
      if (el) el.textContent = text
    }

    set('[data-receipt-eyebrow]', copy.eyebrow)
    set('[data-receipt-title]', copy.title)
    set('[data-receipt-copy]', copy.copy)
    set('[data-receipt-next]', copy.next)

    const stamp = receipt.querySelector('[data-receipt-stamp]')
    const value = typeof reference === 'string' ? reference.trim() : ''
    if (stamp) stamp.hidden = !value
    if (value) set('[data-register-reference]', value)

    // The copy control is an enhancement on an enhancement: only offered where
    // the Clipboard API actually exists, and it is never the only way to keep
    // the reference — the reference itself is selectable text.
    if (copyButton) {
      const offer = Boolean(value) && Boolean(navigator.clipboard)
      copyButton.hidden = !offer
      // The row goes with it, or an empty flex container leaves a 32px hole
      // between the stamp and the closing note.
      const actions = copyButton.closest('.regform-receipt__actions')
      if (actions) actions.hidden = !offer
    }

    form.hidden = true
    receipt.hidden = false

    revealReceipt()

    // Focus, rather than a live region: the receipt is now the whole content
    // of the panel, and focus both announces it and puts the reader inside it.
    receipt.focus()
    ScrollTrigger?.refresh()
  }

  /* --------------------------------------------------------------------
     Motion. The page's four numbers, nothing new.
     -------------------------------------------------------------------- */
  function revealReceipt() {
    if (reduced || !gsap) return
    const parts = receipt.querySelectorAll(
      '.regform-receipt__eyebrow, .regform-receipt__title, .regform-receipt__copy, .regform-receipt__stamp, .regform-receipt__actions, .regform-receipt__next'
    )
    if (!parts.length) return
    gsap.fromTo(
      parts,
      { opacity: 0, y: REVEAL.y },
      {
        opacity: 1,
        y: 0,
        duration: REVEAL.duration,
        ease: REVEAL.ease,
        stagger: REVEAL.stagger,
        clearProps: 'transform',
      }
    )
  }

  function revealForm() {
    if (reduced || !gsap || !ScrollTrigger) return
    const rows = form.querySelectorAll('.regform__field, .regform__foot, .regform__privacy')
    if (!rows.length) return

    gsap.set(rows, { opacity: 0, y: REVEAL.y })
    ScrollTrigger.create({
      trigger: form,
      start: REVEAL.start,
      once: true,
      onEnter: () =>
        gsap.to(rows, {
          opacity: 1,
          y: 0,
          duration: REVEAL.duration,
          ease: REVEAL.ease,
          stagger: REVEAL.stagger,
          overwrite: true,
          clearProps: 'transform',
        }),
    })
  }

  /* --------------------------------------------------------------------
     Wiring.
     -------------------------------------------------------------------- */
  form.addEventListener('submit', onSubmit)

  // A field that has been corrected stops shouting as soon as it is corrected,
  // and is re-checked on the way out. Validating on every keystroke tells
  // somebody their email is invalid while they are still typing the @.
  inputs.forEach((input, name) => {
    input.addEventListener('input', () => clearOne(name))
    input.addEventListener('blur', () => {
      if (busy) return
      const field = FIELD_BY_NAME.get(name)
      if (!field) return
      const message = checkOne(field, input.value.trim())
      if (!message) return
      fieldWrap(name)?.classList.add('is-invalid')
      input.setAttribute('aria-invalid', 'true')
      const error = errorEl(name)
      if (error) error.textContent = message
    })
  })

  if (copyButton) {
    const label = copyButton.querySelector('[data-register-copy-label]')
    copyButton.addEventListener('click', async () => {
      const value = receipt?.querySelector('[data-register-reference]')?.textContent?.trim()
      if (!value || !navigator.clipboard) return
      try {
        await navigator.clipboard.writeText(value)
      } catch {
        return // a denied permission is not worth an error state
      }
      if (label) label.textContent = 'Copied'
      announce(LIVE.copied)
      window.setTimeout(() => {
        if (label) label.textContent = 'Copy reference'
      }, 2400)
    })
  }

  revealForm()
}
