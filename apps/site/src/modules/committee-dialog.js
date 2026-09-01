const DRAG_SLOP = 8

export function initCommitteeDialog({ lenis, reduced } = {}) {
  const dialog = document.querySelector('[data-committee-dialog]')
  const grid = document.querySelector('[data-committees-grid]')
  if (!dialog || !grid) return null

  const slots = {
    icon: dialog.querySelector('[data-cdlg-icon]'),
    code: dialog.querySelector('[data-cdlg-code]'),
    name: dialog.querySelector('#cdlg-name'),
    blurb: dialog.querySelector('[data-cdlg-blurb]'),
    agenda: dialog.querySelector('[data-cdlg-agenda]'),
    agendaBlock: dialog.querySelector('.cdlg__block--agenda'),
    blockLabel: dialog.querySelector('[data-cdlg-block-label]'),
    chair: dialog.querySelector('[data-cdlg-chair]'),
    vice: dialog.querySelector('[data-cdlg-vice]'),
    note: dialog.querySelector('[data-cdlg-note]'),
    level: dialog.querySelector('[data-cdlg-level]'),
    apply: dialog.querySelector('[data-cdlg-apply]'),
  }
  const closeBtn = dialog.querySelector('[data-committee-dialog-close]')

  let opener = null
  let closing = false

  let historyPushed = false

  const text = (el) => (el ? el.textContent.trim().replace(/\s+/g, ' ') : '')

  function fill(item) {
    const card = item.querySelector('.committee__card')
    if (!card) return false

    const icon = card.querySelector('.committee__icon')
    const tag = card.querySelector('.tag')
    // .committee__abbr wraps both the code and the room kind, so read the code
    // element specifically. Falls back for safety if the markup changes.
    const code = text(card.querySelector('.committee__code') ?? card.querySelector('.committee__abbr'))
    const name = text(card.querySelector('.committee__name'))

    if (slots.icon) {
      if (icon?.src) {
        slots.icon.src = icon.src
        slots.icon.hidden = false
      } else {
        slots.icon.hidden = true
      }
    }
    if (slots.code) slots.code.textContent = code
    if (slots.name) slots.name.textContent = name
    if (slots.blurb) slots.blurb.textContent = text(card.querySelector('.committee__blurb'))
    // From the dataset rather than a hidden panel in the card. The panel is
    // gone; this is now the only place the agenda block is rendered.
    //
    // Empty means there is nothing to say: an ordinary committee with no agenda
    // yet. The block is hidden rather than filled with "To be announced", which
    // under a heading reading "Format" would claim the format is undecided when
    // it is simply the same as every other room's. The note below still says
    // the agenda is coming.
    const blockText = item.dataset.blockText ?? ''
    if (slots.agendaBlock) slots.agendaBlock.hidden = blockText === ''
    if (slots.agenda) slots.agenda.textContent = blockText
    if (slots.blockLabel) slots.blockLabel.textContent = item.dataset.blockLabel || 'Agenda'
    if (slots.note) slots.note.textContent = item.dataset.blockNote || ''

    if (slots.chair) slots.chair.textContent = item.dataset.chair || 'To be announced'
    if (slots.vice) slots.vice.textContent = item.dataset.viceChair || 'To be announced'

    if (slots.level) {
      slots.level.textContent = text(tag)
      slots.level.hidden = !tag
    }

    if (slots.apply) {
      const wanted = item.dataset.code || code

      slots.apply.href = wanted
        ? `./register?committee=${encodeURIComponent(wanted)}`
        : './register'
      const label = slots.apply.querySelector('.cdlg__apply-for')
      if (label) label.textContent = name ? ` for ${name}` : ''
    }

    return true
  }

  const docEl = document.documentElement

  function lockScroll() {
    const gap = window.innerWidth - docEl.clientWidth
    if (gap > 0) docEl.style.setProperty('--scrollbar-gap', `${gap}px`)
    docEl.classList.add('has-dialog')
    lenis?.stop()
  }

  function unlockScroll() {
    docEl.classList.remove('has-dialog')
    docEl.style.removeProperty('--scrollbar-gap')
    lenis?.start()
  }

  function open(item, from) {
    if (dialog.open || !fill(item)) return

    opener = from ?? null
    closing = false
    dialog.showModal()
    lockScroll()

    history.pushState({ committeeDialog: true }, '')
    historyPushed = true

    if (reduced) dialog.classList.add('is-open')
    else requestAnimationFrame(() => dialog.classList.add('is-open'))

    closeBtn?.focus()
  }

  function finishClose() {
    if (!dialog.open) return
    dialog.close()
    unlockScroll()
    closing = false

    opener?.focus?.()
    opener = null
  }

  function close() {
    if (!dialog.open || closing) return

    if (historyPushed) {
      historyPushed = false
      history.back()
    }

    closing = true
    dialog.classList.remove('is-open')

    if (reduced) {
      finishClose()
      return
    }

    let done = false
    const settle = () => {
      if (done) return
      done = true
      dialog.removeEventListener('transitionend', onEnd)
      finishClose()
    }

    const panel = dialog.querySelector('.cdlg__panel')

    function onEnd(event) {
      if (event.target === panel && event.propertyName === 'transform') settle()
    }

    dialog.addEventListener('transitionend', onEnd)

    window.setTimeout(settle, 800)
  }

  closeBtn?.addEventListener('click', close)

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })

  dialog.addEventListener('pointerdown', (event) => {
    if (event.target === dialog) close()
  })

  window.addEventListener('popstate', () => {
    historyPushed = false
    if (dialog.open) close()
  })

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return
    historyPushed = false
    closing = false
    dialog.classList.remove('is-open')
    finishClose()
  })

  let press = null

  grid.addEventListener(
    'pointerdown',
    (event) => {
      press = { x: event.clientX, y: event.clientY }
    },
    { passive: true }
  )

  grid.addEventListener('click', (event) => {
    const item = event.target.closest('[data-committee]')
    if (!item) return

    const control = event.target.closest('a, button')
    if (control && !control.hasAttribute('data-committee-open')) return

    const from = press
    press = null

    if (from && event.detail > 0) {
      const moved = Math.hypot(event.clientX - from.x, event.clientY - from.y)
      if (moved > DRAG_SLOP) return
    }

    event.preventDefault()
    open(item, control ?? item.querySelector('[data-committee-open]'))
  })

  return { open, close, dialog }
}
