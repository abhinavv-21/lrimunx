/**
 * nav.js — sticky header, glass-on-scroll, scrollspy, full-screen overlay menu.
 *
 * Zero scroll listeners: the glass/tuck state is driven by a ScrollTrigger
 * callback (rAF-batched by GSAP) and the active-section state by an
 * IntersectionObserver. Nothing here reads layout during a scroll event.
 */

export function initNav({ ScrollTrigger, lenis, reduced }) {
  const nav = document.querySelector('[data-nav]')
  if (!nav) return

  const toggle = document.querySelector('[data-nav-toggle]')
  const toggleLabel = document.querySelector('[data-nav-toggle-label]')
  const overlay = document.querySelector('[data-nav-overlay]')
  const links = Array.from(document.querySelectorAll('[data-nav-link]'))

  /* --------------------------------------------------------------------
     1. Ground state.

     Driven off the HERO'S BOTTOM EDGE, not a pixel constant. Previously
     `is-scrolled` fired at scroll > 24, which over the plum hero painted a
     slightly-darker translucent rectangle with a gold bottom hairline floating
     across the whole opening composition.

     The bar no longer hides on scroll-down. That behaviour had a bug it could
     not be rid of: an anchor jump IS a downward scroll, so tapping a nav link
     tucked the bar away as its direct result — you pressed a control and the
     control left. Suppressing the tuck for programmatic scrolls only would fix
     that one path and leave the bar still disappearing under the reader
     everywhere else, hiding the Register CTA (the page's conversion path) for
     most of the session. On a single landing page with four destinations, a bar
     that is always there is the better trade.
     -------------------------------------------------------------------- */
  const hero = document.querySelector('.hero')
  const navH = () => nav.getBoundingClientRect().height

  if (hero) {
    // A point trigger with explicit enter/leave callbacks, not `isActive` on a
    // ranged one — `isActive` resolved true at scroll 0 on some viewports, which
    // put the glass and its gold hairline across the opening composition.
    ScrollTrigger.create({
      trigger: hero,
      start: () => `bottom top+=${navH()}`,
      invalidateOnRefresh: true,
      onEnter: () => nav.classList.add('is-scrolled'),
      onLeaveBack: () => nav.classList.remove('is-scrolled'),
    })
  } else {
    // Defensive: no hero in the document (e.g. the section is CMS-injected
    // separately). Fall back to a scroll distance.
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        nav.classList.toggle('is-scrolled', self.scroll() > 24)
      },
    })
  }

  /* --------------------------------------------------------------------
     2. Scrollspy — aria-current on the section currently occupying the
     middle band of the viewport.

     The observer keeps a SET of what is currently in the band and re-derives
     the marker from it. It used to act only on `isIntersecting` entries and
     ignore the leaving ones, which meant nothing ever cleared the marker: back
     at the hero, or down in the registration panel, none of the three linked
     sections is in the band — but the last one to have been there kept its gold
     diamond and bold weight, so the bar claimed you were still in a section you
     had left. Most visible straight after Back to top.
     -------------------------------------------------------------------- */
  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean)

  if (sections.length) {
    const inBand = new Set()

    const mark = () => {
      // DOM order breaks the tie when two sections overlap the band, so the
      // marker moves monotonically down the page instead of flickering.
      const active = sections.find((section) => inBand.has(section))
      links.forEach((link) => {
        if (active && link.getAttribute('href') === `#${active.id}`) {
          link.setAttribute('aria-current', 'true')
        } else {
          link.removeAttribute('aria-current')
        }
      })
    }

    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) inBand.add(entry.target)
          else inBand.delete(entry.target)
        })
        mark()
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    )

    sections.forEach((section) => spy.observe(section))
  }

  /* --------------------------------------------------------------------
     3. Overlay menu — full-screen, focus-trapped, Escape-closable.
     -------------------------------------------------------------------- */
  if (!toggle || !overlay) return

  let isOpen = false
  let lastFocused = null

  const focusablesIn = (root) =>
    Array.from(
      root.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter((el) => el.offsetParent !== null)

  function openMenu() {
    if (isOpen) return
    isOpen = true
    lastFocused = document.activeElement

    overlay.hidden = false
    // Next frame, so the transition has a start state to animate from.
    requestAnimationFrame(() => overlay.classList.add('is-open'))

    toggle.setAttribute('aria-expanded', 'true')
    if (toggleLabel) toggleLabel.textContent = 'Close'
    nav.classList.add('is-menu-open')
    document.body.classList.add('u-no-scroll')
    lenis?.stop()

    focusablesIn(overlay)[0]?.focus()
    document.addEventListener('keydown', onKeydown)
  }

  function closeMenu({ restoreFocus = true } = {}) {
    if (!isOpen) return
    isOpen = false

    overlay.classList.remove('is-open')
    toggle.setAttribute('aria-expanded', 'false')
    if (toggleLabel) toggleLabel.textContent = 'Menu'
    nav.classList.remove('is-menu-open')
    document.body.classList.remove('u-no-scroll')
    lenis?.start()

    document.removeEventListener('keydown', onKeydown)

    const hide = () => {
      overlay.hidden = true
    }
    if (reduced) hide()
    else overlay.addEventListener('transitionend', hide, { once: true })

    if (restoreFocus) lastFocused?.focus?.()
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }

    if (event.key !== 'Tab') return

    // Focus trap.
    const focusables = focusablesIn(overlay)
    if (!focusables.length) return

    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  toggle.addEventListener('click', () => (isOpen ? closeMenu() : openMenu()))

  // An in-page link inside the overlay should close it — and hand focus to the
  // destination rather than back to the toggle, which main.js then targets.
  overlay.querySelectorAll('[data-nav-overlay-link]').forEach((link) => {
    link.addEventListener('click', () => closeMenu({ restoreFocus: false }))
  })

  // Returning to desktop width while the overlay is open would otherwise leave
  // the scroll lock in place with no visible menu.
  const desktop = window.matchMedia('(min-width: 900px)')
  desktop.addEventListener('change', (event) => {
    if (event.matches) closeMenu({ restoreFocus: false })
  })
}
