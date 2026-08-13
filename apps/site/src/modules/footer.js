const RING_CIRCUMFERENCE = 2 * Math.PI * 20

export function initFooter(ctx) {
  const { gsap, ScrollTrigger, reduced } = ctx

  const yearEl = document.querySelector('[data-footer-year]')
  if (yearEl) yearEl.textContent = String(new Date().getFullYear())

  initBackToTop(ctx)

  if (reduced) return

  const panel = document.querySelector('.register__panel')
  if (!panel) return

  const parts = panel.querySelectorAll(
    '.register__eyebrow, .register__title, .register__lede'
  )

  gsap.set(parts, { opacity: 0, y: 26 })

  ScrollTrigger.create({
    trigger: panel,
    start: 'top 90%',
    once: true,
    onEnter: () =>
      gsap.to(parts, {
        opacity: 1,
        y: 0,
        duration: 1.25,
        ease: 'expo.out',
        stagger: 0.075,
        clearProps: 'transform',
      }),
  })

  const mark = panel.querySelector('.register__mark')
  if (mark) {
    gsap.to(mark, {
      yPercent: 8,
      ease: 'none',
      scrollTrigger: {
        trigger: panel,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
        invalidateOnRefresh: true,
      },
    })
  }
}

function initBackToTop({ ScrollTrigger, scrollTo, reduced }) {
  const button = document.querySelector('[data-to-top]')
  if (!button) return

  const ring = button.querySelector('[data-to-top-ring]')
  if (ring) {
    ring.style.strokeDasharray = String(RING_CIRCUMFERENCE)
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE)
  }

  button.hidden = false

  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      const progress = self.progress

      button.classList.toggle('is-visible', self.scroll() > window.innerHeight * 0.7)
      if (ring) {
        ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress))
      }
    },
  })

  button.addEventListener('click', () => {
    if (scrollTo) scrollTo('#top')
    else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })

    const target = document.getElementById('main') || document.body
    target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  })
}
