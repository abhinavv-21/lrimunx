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
  // offsetWidth, not getBoundingClientRect: the latter returns the transformed
  // box, and the entry animation holds each card at rotateZ 0.6deg until it
  // finishes, which measured 4.5px too wide and made every step drift.
  const stepSize = () => items[0].offsetWidth + gapOf(rail)

  let ticking = false

  function readState() {
    ticking = false

    const max = maxScroll()
    const progress = max > 0 ? rail.scrollLeft / max : 0
    // The leftmost card on screen, which is what the number is describing.
    // Deriving it from scroll progress instead made the readout run ahead of the
    // rail and show 02 while card 01 was still half visible.
    const index = Math.min(items.length - 1, Math.max(0, Math.round(rail.scrollLeft / stepSize())))

    if (positionEl) positionEl.textContent = pad(index + 1)

    if (progressBar) {
      const width = 1 / items.length
      progressBar.style.inlineSize = `${width * 100}%`
      progressBar.style.transform = `translateX(${(progress * (1 - width) * 100) / width}%)`
    }

    if (prevBtn) prevBtn.disabled = rail.scrollLeft <= 2
    if (nextBtn) nextBtn.disabled = rail.scrollLeft >= max - 2

    syncHover()
  }

  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(readState)
  }

  rail.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })

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

  /**
   * Drag to scroll.
   *
   * The hint under the rail has always said "Scroll, drag or use the arrows",
   * but only touch could actually drag: touch gets native panning for free and
   * a mouse gets nothing. This adds it for mouse and pen only, and leaves touch
   * alone, because native momentum scrolling beats anything reimplemented here.
   *
   * A drag has to start before it counts, or every click on Details would be
   * read as a one-pixel drag and swallowed.
   */
  const DRAG_THRESHOLD = 4

  let dragPointer = null
  let dragStartX = 0
  let dragStartScroll = 0
  let dragging = false

  rail.addEventListener('pointerdown', (event) => {
    gsap.killTweensOf(rail)
    target = rail.scrollLeft

    if (event.pointerType === 'touch') return
    if (event.button !== 0) return

    dragPointer = event.pointerId
    dragStartX = event.clientX
    dragStartScroll = rail.scrollLeft
    dragging = false
  })

  rail.addEventListener('pointermove', (event) => {
    if (event.pointerId !== dragPointer) return

    const travelled = event.clientX - dragStartX

    if (!dragging) {
      if (Math.abs(travelled) < DRAG_THRESHOLD) return
      dragging = true
      rail.classList.add('is-dragging')
      rail.setPointerCapture(dragPointer)
    }

    event.preventDefault()
    rail.scrollLeft = dragStartScroll - travelled
    target = rail.scrollLeft
  })

  function endDrag(event) {
    if (event.pointerId !== dragPointer) return

    if (dragging) {
      // Kill only the click that this pointerup is about to fire. Registering it
      // unconditionally left it armed when no click followed, so it ate the
      // user's next real click on the rail instead.
      const swallow = (click) => click.stopPropagation()
      rail.addEventListener('click', swallow, { capture: true, once: true })
      window.setTimeout(() => rail.removeEventListener('click', swallow, true), 0)
    }

    if (rail.hasPointerCapture?.(dragPointer)) rail.releasePointerCapture(dragPointer)
    rail.classList.remove('is-dragging')

    // Settle on a card rather than stopping wherever the button came up.
    if (dragging) scrollToIndex(Math.round(rail.scrollLeft / stepSize()))

    dragPointer = null
    dragging = false
  }

  rail.addEventListener('pointerup', endDrag)
  rail.addEventListener('pointercancel', endDrag)

  prevBtn?.addEventListener('click', () => scrollByCards(-1))
  nextBtn?.addEventListener('click', () => scrollByCards(1))

  let wheelIdle

  rail.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) return
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

      const max = maxScroll()
      if (max <= 0) return

      const atStart = target <= 0.5
      const atEnd = target >= max - 0.5
      if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) return

      event.preventDefault()

      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1

      glideTo(target + event.deltaY * unit * 0.9, 0.7)

      rail.classList.add('is-wheel-active')
      clearTimeout(wheelIdle)
      wheelIdle = setTimeout(() => rail.classList.remove('is-wheel-active'), 260)
    },
    { passive: false }
  )

  let pointerInside = false
  section?.addEventListener('pointerenter', () => (pointerInside = true))
  section?.addEventListener('pointerleave', () => (pointerInside = false))

  function handleKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return

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
    if (rail.contains(document.activeElement)) return
    if (!pointerInside) return
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    handleKey(event)
  })

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

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')

  if (finePointer.matches) rail.classList.add('is-hover-synced')

  let pointerX = -1
  let pointerY = -1

  function syncHover() {
    if (!finePointer.matches) return
    const under = pointerX < 0 ? null : document.elementFromPoint(pointerX, pointerY)
    const card = under ? under.closest('[data-committee]') : null
    items.forEach((item) => item.classList.toggle('is-hovered', item === card))
  }

  section?.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return
      pointerX = event.clientX
      pointerY = event.clientY
      syncHover()
    },
    { passive: true }
  )

  section?.addEventListener('pointerleave', () => {
    pointerX = -1
    pointerY = -1
    syncHover()
  })

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
