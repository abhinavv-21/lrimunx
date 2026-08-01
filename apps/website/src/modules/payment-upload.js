/**
 * payment-upload.js — the payment screenshot control on step 2.
 *
 * The file goes STRAIGHT from the browser to Vercel Blob and only its URL is
 * posted to the API. That is not an optimisation, it is the only workable
 * shape: a screenshot off a modern phone routinely clears the 4.5 MB a
 * serverless function body caps at, and pushing it through a JSON API would
 * mean base64 (+33%) on top of that. A direct upload also means the reader
 * sees real progress rather than a spinner.
 *
 * The client library is loaded ON DEMAND rather than imported at the top of
 * the page. It is ~110 KB that nobody who abandons on step 1 should ever
 * download, and it is warmed the moment step 2 opens, so by the time a file is
 * chosen the chunk is already there.
 *
 * States: idle · invalid · uploading · uploaded · failed. Every failure keeps
 * the reader on step 2 with everything they typed intact, and none of them
 * ever implies the registration was sent.
 *
 * Nothing here is `disabled` while work is in flight — a disabled control drops
 * focus to <body>, which mid-upload would strand a keyboard user at the top of
 * the document. The plate stops taking pointer events, the module refuses a
 * second file while one is running, and the control keeps its focus.
 */

/* The same two limits the upload route enforces in
   apps/backend/src/routes/public.routes.ts. Duplicated deliberately: the
   server is the authority, and this copy exists so that "that is a 40 MB
   video" is answered instantly and locally rather than after a minute of
   uploading. */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 8 * 1024 * 1024

const COPY = {
  idle: 'No screenshot added yet.',
  uploading: 'Uploading your screenshot…',
  uploaded: 'Screenshot uploaded.',
  type: 'That file is not an image this form can take. Use a PNG, JPEG or WebP — a screenshot from your phone will already be one of those.',
  size: 'That image is larger than 8 MB. Send the screenshot rather than the full-resolution photo, or crop it to the confirmation.',
  empty: 'That file is empty. Try taking the screenshot again.',
  failed:
    'The screenshot could not be uploaded. Nothing has been sent and everything you have typed is still here — check your connection and try again. If it keeps failing, contact the secretariat at the address in the footer.',
  offline:
    'This device looks offline, so the screenshot could not be uploaded. Everything you have typed is still here — try again once you are back online.',
}

/** Loaded once, shared by both calls, and never awaited before it is needed. */
let blobClient = null
function loadBlobClient() {
  blobClient ??= import('@vercel/blob/client')
  return blobClient
}

/**
 * A pathname the store can live with, derived from whatever the phone gave us.
 *
 * Phone galleries produce names like `Screenshot 2026-08-01 at 14.02.11.png`,
 * and an IME produces worse. Anything outside a–z, 0–9, dot and dash is
 * collapsed so the resulting URL needs no escaping; the extension is preserved,
 * because the store derives the content type from it. Collisions are not this
 * function's problem — the upload route sets addRandomSuffix.
 */
function safeName(name) {
  const fallback = 'payment-screenshot.png'
  const cleaned = String(name || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(-64)
  return cleaned.includes('.') ? cleaned : fallback
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * @param {HTMLElement} root  the [data-upload] block
 * @param {{ endpoint: string, announce?: Function, onChange?: Function }} options
 */
export function initPaymentUpload(root, { endpoint, announce, onChange } = {}) {
  if (!root) return null

  const input = root.querySelector('[data-upload-input]')
  const plate = root.querySelector('[data-upload-plate]')
  const text = root.querySelector('[data-upload-text]')
  const progress = root.querySelector('[data-upload-progress]')
  const bar = root.querySelector('[data-upload-bar]')
  const result = root.querySelector('[data-upload-result]')
  const thumb = root.querySelector('[data-upload-thumb]')
  const filename = root.querySelector('[data-upload-filename]')
  const replace = root.querySelector('[data-upload-replace]')
  const error = root.querySelector('[data-error-for="paymentProof"]')
  if (!input || !plate) return null

  let url = ''
  let busy = false
  let locked = false
  let preview = ''

  const say = (message) => {
    if (typeof announce === 'function' && message) announce(message)
  }

  const changed = () => {
    if (typeof onChange === 'function') onChange(url)
  }

  function setStatus(message) {
    if (text) text.textContent = message
  }

  function setError(message) {
    root.classList.toggle('is-invalid', Boolean(message))
    input.setAttribute('aria-invalid', message ? 'true' : 'false')
    if (error) error.textContent = message || ''
  }

  function setProgress(percentage) {
    if (!progress || !bar) return
    const clamped = Math.max(0, Math.min(100, Number(percentage) || 0))
    progress.hidden = false
    // Transform, not width: a width animation on a 2px bar relayouts the whole
    // block on every frame of a slow upload.
    bar.style.transform = `scaleX(${clamped / 100})`
  }

  function hideProgress() {
    if (!progress || !bar) return
    progress.hidden = true
    bar.style.transform = 'scaleX(0)'
  }

  function setBusy(state) {
    busy = state
    root.classList.toggle('is-uploading', state)
    if (replace) replace.setAttribute('aria-disabled', String(state))
  }

  function dropPreview() {
    if (!preview) return
    URL.revokeObjectURL(preview)
    preview = ''
  }

  function showResult(file) {
    if (!result) return
    dropPreview()
    // A local object URL rather than blob.url: the thumbnail appears instantly,
    // costs no second round trip, and does not depend on the store having
    // finished making the object publicly readable.
    preview = URL.createObjectURL(file)
    if (thumb) thumb.src = preview
    if (filename) filename.textContent = `${file.name} · ${formatSize(file.size)}`
    result.hidden = false
    root.classList.add('is-uploaded')
  }

  function clearResult() {
    if (result) result.hidden = true
    root.classList.remove('is-uploaded')
    if (thumb) thumb.removeAttribute('src')
    dropPreview()
  }

  function check(file) {
    if (!file) return null
    if (!ACCEPTED.includes(file.type)) return COPY.type
    if (file.size > MAX_BYTES) return COPY.size
    if (file.size === 0) return COPY.empty
    return null
  }

  async function handle(file) {
    if (busy || locked) return

    const problem = check(file)
    if (problem) {
      url = ''
      clearResult()
      setStatus(COPY.idle)
      setError(problem)
      say(problem)
      changed()
      return
    }

    setError('')
    url = ''
    changed()
    setBusy(true)
    setStatus(COPY.uploading)
    setProgress(0)
    say(COPY.uploading)

    try {
      const { upload } = await loadBlobClient()
      const blob = await upload(safeName(file.name), file, {
        access: 'public',
        handleUploadUrl: endpoint,
        contentType: file.type,
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      })

      url = typeof blob?.url === 'string' ? blob.url : ''
      if (!url) throw new Error('No blob URL returned')

      setBusy(false)
      hideProgress()
      setStatus(COPY.uploaded)
      showResult(file)
      say('Screenshot uploaded. You can send your registration now.')
      changed()
    } catch {
      // A refused token, a dropped connection, a blocked request and a store
      // error all mean the same thing to the reader: it is not up there.
      url = ''
      setBusy(false)
      hideProgress()
      clearResult()
      setStatus(COPY.idle)
      const message = navigator.onLine === false ? COPY.offline : COPY.failed
      setError(message)
      say(message)
      changed()
    }
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) handle(file)
  })

  replace?.addEventListener('click', () => {
    if (busy || locked) return
    // Cleared first, or choosing the same file again fires no change event.
    input.value = ''
    input.click()
  })

  /* --------------------------------------------------------------------
     Drag and drop — an addition to the control, never the only way in. The
     picker behind the label stays the primary path, which is what keeps this
     usable by keyboard and on touch, where there is no drag at all.
     -------------------------------------------------------------------- */
  const stop = (event) => {
    event.preventDefault()
    event.stopPropagation()
  }

  ;['dragenter', 'dragover'].forEach((type) =>
    plate.addEventListener(type, (event) => {
      stop(event)
      if (!busy && !locked) plate.classList.add('is-dropping')
    })
  )
  ;['dragleave', 'dragend'].forEach((type) =>
    plate.addEventListener(type, (event) => {
      stop(event)
      plate.classList.remove('is-dropping')
    })
  )

  plate.addEventListener('drop', (event) => {
    stop(event)
    plate.classList.remove('is-dropping')
    const file = event.dataTransfer?.files?.[0]
    if (file) handle(file)
  })

  window.addEventListener('pagehide', dropPreview, { once: true })

  return {
    get url() {
      return url
    },
    get busy() {
      return busy
    },

    /** Called when step 2 opens: pull the client down before it is needed. */
    warm() {
      loadBlobClient().catch(() => {
        /* Retried, and reported, at the moment a file is actually chosen. */
      })
    },

    focus() {
      // The <input> is what takes focus — it is the real control, and the plate
      // paints its ring through an adjacent-sibling rule. Scrolled with the
      // plate, because the input itself is a 1px box.
      input.focus()
      plate.scrollIntoView({ block: 'center', behavior: 'auto' })
    },

    setError,

    /** Held while the registration is in flight. */
    setReadOnly(state) {
      locked = state
      root.classList.toggle('is-locked', state)
      if (replace) replace.setAttribute('aria-disabled', String(state || busy))
    },
  }
}
