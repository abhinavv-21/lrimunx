/**
 * committee-dialog.js — the committee detail dialog.
 *
 * WHY THIS EXISTS
 * The Apply control used to live in the card footer, underneath the hover
 * reveal panel. `.committee__reveal` is `inset-block-end: 0` and slides over
 * the whole footer, so from the moment the pointer entered the card the button
 * was covered by an opaque panel — visible for the length of the transition,
 * then gone. Raising it with z-index only produced a button floating on a dark
 * strip. The control and the panel were competing for the same 3rem of card.
 *
 * So Apply moved out of the card entirely. The card keeps its hover reveal
 * exactly as it was, and clicking anywhere on it opens this dialog: chair,
 * vice chair, agenda, procedure — and Apply, with the whole width of a panel
 * to itself and nothing that can slide over it.
 *
 * ONE DIALOG, NOT SIX
 * Everything except the chairs already exists in the card markup, so it is
 * read from the card at open time rather than written out a second time.
 * Six copies of the agenda is six places for the agenda to go stale.
 *
 * WHY A NATIVE <dialog>
 * `showModal()` gives the focus trap, Escape, the inert background and the
 * backdrop for free, all of them things a div-with-role="dialog" gets subtly
 * wrong. Supported everywhere in this project's browserslist.
 */

/** Movement past this many px between press and release reads as a drag. */
const DRAG_SLOP = 8

export function initCommitteeDialog({ lenis, reduced } = {}) {
  const dialog = document.querySelector('[data-committee-dialog]')
  const rail = document.querySelector('[data-committees-rail]')
  if (!dialog || !rail) return null

  const slots = {
    icon: dialog.querySelector('[data-cdlg-icon]'),
    code: dialog.querySelector('[data-cdlg-code]'),
    name: dialog.querySelector('#cdlg-name'),
    blurb: dialog.querySelector('[data-cdlg-blurb]'),
    agenda: dialog.querySelector('[data-cdlg-agenda]'),
    chair: dialog.querySelector('[data-cdlg-chair]'),
    vice: dialog.querySelector('[data-cdlg-vice]'),
    note: dialog.querySelector('[data-cdlg-note]'),
    level: dialog.querySelector('[data-cdlg-level]'),
    apply: dialog.querySelector('[data-cdlg-apply]'),
  }
  const closeBtn = dialog.querySelector('[data-committee-dialog-close]')

  let opener = null
  let closing = false
  /** True while OUR history entry is the current one. See the Back section. */
  let historyPushed = false

  const text = (el) => (el ? el.textContent.trim().replace(/\s+/g, ' ') : '')

  /* --------------------------------------------------------------------
     Filling.
     -------------------------------------------------------------------- */
  function fill(item) {
    const card = item.querySelector('.committee__card')
    if (!card) return false

    const icon = card.querySelector('.committee__icon')
    const tag = card.querySelector('.tag')
    const code = text(card.querySelector('.committee__abbr'))
    const name = text(card.querySelector('.committee__name'))

    if (slots.icon) {
      // The card's icon is `alt=""` marginalia and stays that way here — the
      // committee is named in the heading a line below, so an alt would be the
      // same string read twice.
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
    if (slots.agenda) slots.agenda.textContent = text(card.querySelector('.committee__reveal-text'))
    if (slots.note) slots.note.textContent = text(card.querySelector('.committee__reveal-note'))

    if (slots.chair) slots.chair.textContent = item.dataset.chair || 'To be announced'
    if (slots.vice) slots.vice.textContent = item.dataset.viceChair || 'To be announced'

    if (slots.level) {
      // The card's own `.tag--*` classes are NOT carried over. Their contrast
      // was measured against paper and against the tint card; two of the three
      // tiers are text-primary or magenta, which on this plum panel are 1.02:1
      // and 2.9:1. Here the level is gold on ink — 7.99:1 — for every tier.
      slots.level.textContent = text(tag)
      slots.level.hidden = !tag
    }

    if (slots.apply) {
      const wanted = item.dataset.code || code
      // No code, no preselection — the form still works, it just opens with
      // nothing chosen. A query string carrying an empty value would read on
      // the other side as "they chose nothing", which is a different answer.
      slots.apply.href = wanted
        ? `./register?committee=${encodeURIComponent(wanted)}`
        : './register'
      const label = slots.apply.querySelector('.cdlg__apply-for')
      if (label) label.textContent = name ? ` for ${name}` : ''
    }

    return true
  }

  /* --------------------------------------------------------------------
     Scroll lock.

     showModal() makes the background inert but does NOT stop it scrolling, and
     under Lenis the page keeps gliding behind the panel. Lenis is stopped and
     the document is pinned; the pin compensates for the scrollbar it removes,
     or the whole page jumps sideways as the dialog opens.
     -------------------------------------------------------------------- */
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

  /* --------------------------------------------------------------------
     Open / close.
     -------------------------------------------------------------------- */
  function open(item, from) {
    if (dialog.open || !fill(item)) return

    opener = from ?? null
    closing = false
    dialog.showModal()
    lockScroll()

    // An open panel is a place you can go Back from. Nothing about a modal says
    // so to the browser — showModal() is not navigation — so a history entry is
    // pushed to stand for it. Without one, Back leaves the panel sitting there
    // and takes you off the page underneath instead, which is the opposite of
    // what pressing Back over an open panel means.
    history.pushState({ committeeDialog: true }, '')
    historyPushed = true

    // The class drives the entrance. `@starting-style` would be tidier but is
    // not in this project's Safari floor, and an entrance that only plays on
    // newer browsers is not an entrance.
    if (reduced) dialog.classList.add('is-open')
    else requestAnimationFrame(() => dialog.classList.add('is-open'))

    closeBtn?.focus()
  }

  function finishClose() {
    if (!dialog.open) return
    dialog.close()
    unlockScroll()
    closing = false
    // Focus goes back where it came from. Without this it lands on <body> and
    // a keyboard reader is returned to the top of the document with no account
    // of how they got there.
    opener?.focus?.()
    opener = null
  }

  function close() {
    if (!dialog.open || closing) return

    /*
      Give the history entry back before anything else.

      `history.back()` dispatches popstate as a later task, by which point
      `closing` is already true and the popstate handler returns without doing
      the work twice. Skipped when the entry is already gone — which is exactly
      the case when Back is what got us here.
    */
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

    // Specifically the panel's TRANSFORM — the longest of the three properties
    // in flight. transitionend bubbles, so an unfiltered listener would fire on
    // whichever finished first (opacity, at half the duration) and cut the exit
    // in half.
    function onEnd(event) {
      if (event.target === panel && event.propertyName === 'transform') settle()
    }

    dialog.addEventListener('transitionend', onEnd)
    // A transition that never fires — an interrupted paint, a background tab —
    // must not leave the page pinned behind a panel nobody can see.
    window.setTimeout(settle, 800)
  }

  closeBtn?.addEventListener('click', close)

  // Escape fires `cancel`; letting the platform close it outright would skip
  // the exit transition and the scroll unlock.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })

  // Clicking the backdrop. The event target is the <dialog> itself only when
  // the press landed outside the panel, so no geometry is needed.
  dialog.addEventListener('pointerdown', (event) => {
    if (event.target === dialog) close()
  })

  /* --------------------------------------------------------------------
     Back.
     -------------------------------------------------------------------- */
  window.addEventListener('popstate', () => {
    // Whatever just happened, our entry is no longer the current one.
    historyPushed = false
    if (dialog.open) close()
  })

  /*
    Coming back to this page from the register form.

    A bfcached document is restored exactly as it was left — including an open
    dialog and the scroll lock on <html>. Nothing re-runs, so nothing would ever
    take it down again, and the reader lands on a panel over a page that will
    not scroll. Snapped shut rather than animated: as far as they are concerned
    it was never open on this visit.
  */
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return
    historyPushed = false
    closing = false
    dialog.classList.remove('is-open')
    finishClose()
  })

  /* --------------------------------------------------------------------
     Opening from a card.

     Delegated on the rail. Two things are filtered out:

       · clicks on another control inside the card — there are none today, but
         a card that swallows its own links is a trap waiting to be set;
       · the release of a drag. The rail is a horizontal scroller people flick
         through, and a flick that ends on a card is not a click on it.
     -------------------------------------------------------------------- */
  let press = null

  rail.addEventListener(
    'pointerdown',
    (event) => {
      press = { x: event.clientX, y: event.clientY }
    },
    { passive: true }
  )

  rail.addEventListener('click', (event) => {
    const item = event.target.closest('[data-committee]')
    if (!item) return

    const control = event.target.closest('a, button')
    if (control && !control.hasAttribute('data-committee-open')) return

    const from = press
    press = null

    /*
      `event.detail` is the click count, and it is 0 for the click a browser
      synthesises when Enter or Space is pressed on a button. Such a click also
      reports clientX/clientY as 0, so measuring it against a press position
      produces the distance from the card to the top-left corner of the viewport
      — always past the slop, always read as a drag.

      A press only stays on record when the gesture ended without a click on a
      card: released over the gap between two cards, or dragged off the rail
      entirely. After either of those, the next Enter on a card opened nothing
      and the one after it worked, because the first had cleared the stale press.
      A keyboard activation has no pointer travel to measure, so it is not
      measured.
    */
    if (from && event.detail > 0) {
      const moved = Math.hypot(event.clientX - from.x, event.clientY - from.y)
      if (moved > DRAG_SLOP) return
    }

    event.preventDefault()
    open(item, control ?? item.querySelector('[data-committee-open]'))
  })

  return { open, close, dialog }
}
