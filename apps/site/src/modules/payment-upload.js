const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 8 * 1024 * 1024

const COPY = {
  idle: 'No screenshot added yet.',
  uploading: 'Uploading your screenshot…',
  uploaded: 'Screenshot uploaded.',
  type: 'That file is not an image this form can take. Use a PNG, JPEG or WebP. A screenshot from your phone will already be one of those.',
  size: 'That image is larger than 8 MB. Send the screenshot rather than the full-resolution photo, or crop it to the confirmation.',
  empty: 'That file is empty. Try taking the screenshot again.',
  failed:
    'The screenshot could not be uploaded. Nothing has been sent and everything you have typed is still here, so check your connection and try again. If it keeps failing, contact the secretariat using the details in the footer.',
  offline:
    'This device looks offline, so the screenshot could not be uploaded. Everything you have typed is still here. Try again once you are back online.',
  // The server answers 503 when object storage is not configured. Retrying
  // cannot help, so say what is actually wrong rather than sending the delegate
  // to check a connection that is fine.
  unavailable:
    'Screenshot uploads are not switched on yet. This is on our side, not yours. Send your registration without one and the secretariat will ask you for it by email.',
}

/** Uploads are off at the server, not failing. Retrying will not change it. */
class UploadsUnavailable extends Error {}

function putSignedFile(uploadUrl, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', uploadUrl, true)
    request.setRequestHeader('Content-Type', contentType)

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100)
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new Error(`Store refused the upload (${request.status})`))
    })
    request.addEventListener('error', () => reject(new Error('Network error during upload')))
    request.addEventListener('abort', () => reject(new Error('Upload aborted')))
    request.send(file)
  })
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

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

  let failures = 0
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
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      })
      if (response.status === 503) throw new UploadsUnavailable()
      if (!response.ok) throw new Error(`Upload could not be started (${response.status})`)

      const { uploadUrl, fileUrl, contentType } = await response.json()
      if (!uploadUrl || !fileUrl) throw new Error('Upload endpoint returned no URL')

      await putSignedFile(uploadUrl, file, contentType || file.type, setProgress)

      url = fileUrl

      setBusy(false)
      hideProgress()
      failures = 0
      setStatus(COPY.uploaded)
      showResult(file)
      say('Screenshot uploaded. You can send your registration now.')
      changed()
    } catch (error) {
      url = ''
      setBusy(false)
      hideProgress()
      clearResult()
      setStatus(COPY.idle)

      let message
      if (error instanceof UploadsUnavailable) {
        // Count it as spent rather than as one failed attempt, so the form stops
        // demanding a screenshot it is never going to be able to take.
        failures = Number.MAX_SAFE_INTEGER
        message = COPY.unavailable
      } else {
        failures += 1
        message = navigator.onLine === false ? COPY.offline : COPY.failed
      }

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

    input.value = ''
    input.click()
  })

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
    get failures() {
      return failures
    },
    warm() {
      try {
        const health = new URL(endpoint, window.location.href)
        health.pathname = '/health'
        health.search = ''
        void fetch(health.toString(), { method: 'GET', mode: 'cors' }).catch(() => {})
      } catch {
      }
    },
    focus() {
      input.focus()
      plate.scrollIntoView({ block: 'center', behavior: 'auto' })
    },
    setError,
    setReadOnly(state) {
      locked = state
      root.classList.toggle('is-locked', state)
      if (replace) replace.setAttribute('aria-disabled', String(state || busy))
    },
  }
}
