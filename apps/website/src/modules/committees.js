/**
 * committees.js — behaviour for the horizontal committee rail.
 *
 * The rail is a native overflow container, so scrolling, touch momentum and
 * assistive-tech traversal all come free. This module adds what a native
 * container does not have:
 *
 *   · vertical wheel input mapped onto the horizontal axis while the pointer
 *     is inside the rail — and released again at either end, so the page never
 *     traps the scroll
 *   · arrow keys that work on hover, not only once the rail has been tabbed to
 *   · prev/next buttons, a position readout and a progress bar
 *   · a tap affordance for the reveal panel on touch devices
 *
 * The card's detail dialog is a separate module — committee-dialog.js.
 *
 * Keyboard contract:
 *   ← / →       previous / next committee (rail focused OR pointer inside)
 *   Home / End  first / last
 *   Tab         moves through cards; the focused card is scrolled into view
 */

export function initCommittees({ gsap, ScrollTrigger, reduced }) {
  const rail = document.querySelector('[data-committees-rail]')
  if (!rail) return

  const items = Array.from(rail.querySelectorAll('[data-committee]'))
  if (!items.length) return

  const section = document.querySelector('[data-committees-section]')
  const prevBtn = document.querySelector('[data-committees-prev]')
  const nextBtn = document.querySelector('[data-committees-next]')
  const positionEl = document.querySelector('[data-committees-position]')
  const totalEl = document.querySelector('[data-committees-total]')
  const progressBar = document.querySelector('[data-committees-progress]')

  const pad = (n) => String(n).padStart(2, '0')
  if (totalEl) totalEl.textContent = pad(items.length)

  const maxScroll = () => rail.scrollWidth - rail.clientWidth
  const gapOf = (el) => {
    const gap = parseFloat(getComputedStyle(el).columnGap)
    return Number.isFinite(gap) ? gap : 0
  }
  const stepSize = () => items[0].getBoundingClientRect().width + gapOf(rail)

  /* --------------------------------------------------------------------
     Position + progress. Read on scroll, but deferred to rAF so nothing
     forces layout mid-scroll.
     -------------------------------------------------------------------- */
  let ticking = false

  function readState() {
    ticking = false

    const max = maxScroll()
    const progress = max > 0 ? rail.scrollLeft / max : 0
    const index = Math.min(items.length - 1, Math.max(0, Math.round(rail.scrollLeft / stepSize())))

    if (positionEl) positionEl.textContent = pad(index + 1)

    if (progressBar) {
      const width = 1 / items.length
      progressBar.style.inlineSize = `${width * 100}%`
      progressBar.style.transform = `translateX(${(progress * (1 - width) * 100) / width}%)`
    }

    if (prevBtn) prevBtn.disabled = rail.scrollLeft <= 2
    if (nextBtn) nextBtn.disabled = rail.scrollLeft >= max - 2
  }

  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(readState)
  }

  rail.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })

  /* --------------------------------------------------------------------
     Movement.

     Everything routes through one tween against a single `target` position.
     Previously the wheel wrote `rail.scrollLeft +=` directly while the arrows
     used native `scrollBy({behavior:'smooth'})` — two mechanisms driving the
     same axis, so a wheel flick mid-animation fought the browser's own smooth
     scroll and the rail juddered. One owner, one easing curve, no contention.
     -------------------------------------------------------------------- */
  let target = rail.scrollLeft

  const clamp = (x) => Math.max(0, Math.min(maxScroll(), x))

  function glideTo(x, duration = 0.85) {
    target = clamp(x)
    if (reduced) {
      gsap.set(rail, { scrollLeft: target })
      return
    }
    gsap.to(rail, {
      scrollLeft: target,
      duration,
      ease: 'expo.out',
      overwrite: true,
    })
  }

  function scrollByCards(direction) {
    glideTo(target + stepSize() * direction)
  }

  function scrollToIndex(index) {
    const i = Math.min(items.length - 1, Math.max(0, index))
    glideTo(i * stepSize())
  }

  // A drag, a touch flick or a native scroll all move the rail without going
  // through the tween; resync so the next glide starts from where it really is.
  rail.addEventListener(
    'pointerdown',
    () => {
      gsap.killTweensOf(rail)
      target = rail.scrollLeft
    },
    { passive: true }
  )

  prevBtn?.addEventListener('click', () => scrollByCards(-1))
  nextBtn?.addEventListener('click', () => scrollByCards(1))

  /* --------------------------------------------------------------------
     Wheel → horizontal.
     Only vertical-dominant input is remapped; a trackpad's horizontal
     gesture already scrolls the container natively and is left alone.

     Capture is released once the rail is at the end it is being pushed
     towards, so reaching the last card hands the wheel back to the page
     rather than trapping the reader inside the section.
     -------------------------------------------------------------------- */
  let wheelIdle

  rail.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) return // pinch-zoom
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return // already horizontal

      const max = maxScroll()
      if (max <= 0) return

      const atStart = target <= 0.5
      const atEnd = target >= max - 0.5
      if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) return

      event.preventDefault()
      // deltaMode 1 is lines, 2 is pages — normalise both to pixels.
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1
      // Accumulate onto the tween target rather than onto the live scroll
      // position, so a fast flick reads as one long glide instead of a stack
      // of competing short ones.
      glideTo(target + event.deltaY * unit * 0.9, 0.7)

      rail.classList.add('is-wheel-active')
      clearTimeout(wheelIdle)
      wheelIdle = setTimeout(() => rail.classList.remove('is-wheel-active'), 260)
    },
    { passive: false }
  )

  /* --------------------------------------------------------------------
     Keyboard. The rail itself is focusable and handles keys directly; the
     document-level handler additionally serves the (much more common) case
     of the pointer simply resting over the section.
     -------------------------------------------------------------------- */
  let pointerInside = false
  section?.addEventListener('pointerenter', () => (pointerInside = true))
  section?.addEventListener('pointerleave', () => (pointerInside = false))

  function handleKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return

    // Never steal keys from a field or any other editable surface.
    const el = document.activeElement
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        scrollByCards(1)
        break
      case 'ArrowLeft':
        event.preventDefault()
        scrollByCards(-1)
        break
      case 'Home':
        event.preventDefault()
        scrollToIndex(0)
        break
      case 'End':
        event.preventDefault()
        scrollToIndex(items.length - 1)
        break
      default:
    }
  }

  rail.addEventListener('keydown', handleKey)

  document.addEventListener('keydown', (event) => {
    if (rail.contains(document.activeElement)) return // rail handler already ran
    if (!pointerInside) return
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    handleKey(event)
  })

  // Tabbing into an off-screen card must bring it into view, or the focus ring
  // is drawn outside the visible track.
  items.forEach((item, index) => {
    item.addEventListener(
      'focusin',
      () => {
        const itemBox = item.getBoundingClientRect()
        const railBox = rail.getBoundingClientRect()
        if (itemBox.left < railBox.left || itemBox.right > railBox.right) scrollToIndex(index)
      },
      true
    )
  })

  /* --------------------------------------------------------------------
     The agenda panel.

     The panel itself is pure CSS — hover, and `:focus-within` for the keyboard.
     Each card carries a real <button> so that `:focus-within` has something to
     fire on: before it existed, nothing inside .committee__card was focusable —
     it was an <article> of headings and paragraphs — and the agenda, seat count
     and procedure notes were reachable by mouse and by touch but NOT by
     keyboard at all. That is SC 2.1.1, on content the conference actually needs
     delegates to read.

     That button no longer expands the panel in place; it opens the committee
     dialog, which is where the full detail and the Apply control now live. See
     src/modules/committee-dialog.js for why they moved.
     -------------------------------------------------------------------- */

  /* --------------------------------------------------------------------
     Entrance. One batched trigger for the whole rail rather than six.
     -------------------------------------------------------------------- */
  if (!reduced) {
    gsap.set(items, { opacity: 0, y: 26, rotateZ: 0.6 })
    ScrollTrigger.create({
      trigger: rail,
      start: 'top 94%',
      once: true,
      onEnter: () =>
        gsap.to(items, {
          opacity: 1,
          y: 0,
          rotateZ: 0,
          duration: 1.15,
          ease: 'expo.out',
          stagger: 0.075,
          clearProps: 'transform',
        }),
    })
  }

  readState()
}
