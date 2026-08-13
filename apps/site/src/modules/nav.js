export function initNav({ ScrollTrigger, lenis, reduced }) {
  const nav = document.querySelector('[data-nav]')
  if (!nav) return

  const toggle = document.querySelector('[data-nav-toggle]')
  const toggleLabel = document.querySelector('[data-nav-toggle-label]')
  const overlay = document.querySelector('[data-nav-overlay]')
  const links = Array.from(document.querySelectorAll('[data-nav-link]'))

  const hero = document.querySelector('.hero')
  const navH = () => nav.getBoundingClientRect().height

  if (hero) {
    let heroBottom = Infinity
    let earlyGlassAt = Infinity

    const apply = (y) => {
      nav.classList.toggle('is-scrolled', y >= heroBottom || y > earlyGlassAt)
    }

    const measure = (self) => {
      const rect = hero.getBoundingClientRect()
      heroBottom = rect.top + window.scrollY + rect.height - navH()

      earlyGlassAt =
        rect.height > window.innerHeight + navH()
          ? window.innerHeight * 0.35
          : Infinity

      apply(self ? self.scroll() : window.scrollY)
    }

    measure()

    ScrollTrigger.create({
      start: 0,
      end: 'max',
      invalidateOnRefresh: true,
      onRefresh: measure,
      onUpdate: (self) => apply(self.scroll()),
    })
  } else {
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        nav.classList.toggle('is-scrolled', self.scroll() > 24)
      },
    })
  }

  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean)

  if (sections.length) {
    const inBand = new Set()

    const mark = () => {
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

  overlay.querySelectorAll('[data-nav-overlay-link]').forEach((link) => {
    link.addEventListener('click', () => closeMenu({ restoreFocus: false }))
  })

  const desktop = window.matchMedia('(min-width: 900px)')
  desktop.addEventListener('change', (event) => {
    if (event.matches) closeMenu({ restoreFocus: false })
  })
}
