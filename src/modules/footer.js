/**
 * footer.js — registration panel, footer, and the back-to-top control.
 *
 * Scope note (agreed in the Phase 1 review): the Instagram link is a plain
 * outbound link, not a feed integration. Embedding a live feed needs a Graph
 * API token, a server-side proxy to keep it out of the client, and a review
 * pass on third-party cookies — none of which were in scope.
 */

const RING_CIRCUMFERENCE = 2 * Math.PI * 20 // r = 20 in the SVG

export function initFooter(ctx) {
  const { gsap, ScrollTrigger, reduced } = ctx

  /* --------------------------------------------------------------------
     Copyright year. Static in the markup as a no-JS fallback, corrected
     here at runtime.
     -------------------------------------------------------------------- */
  const yearEl = document.querySelector('[data-footer-year]')
  if (yearEl) yearEl.textContent = String(new Date().getFullYear())

  initBackToTop(ctx)

  if (reduced) return

  /* --------------------------------------------------------------------
     Registration panel — one measured reveal. This is the last thing on
     the page and the one action it wants, so it gets a single clean beat
     rather than a staggered cascade.
     -------------------------------------------------------------------- */
  const panel = document.querySelector('.register__panel')
  if (!panel) return

  const parts = panel.querySelectorAll(
    '.register__eyebrow, .register__title, .register__lede, .register__actions, .register__facts'
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

  // The gold X watermark drifts as the block passes — 8% travel, transform
  // only, behind the reduced-motion guard above.
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

/**
 * Back to top.
 *
 * The ring is a live scroll-progress readout rather than decoration, so the
 * control tells you where you are as well as offering the way back. Driven off
 * a single ScrollTrigger (rAF-batched by GSAP) — no scroll listener.
 */
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
      // Appear once the hero is behind us; hiding it over the hero keeps the
      // opening composition clean.
      button.classList.toggle('is-visible', self.scroll() > window.innerHeight * 0.7)
      if (ring) {
        ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress))
      }
    },
  })

  button.addEventListener('click', () => {
    if (scrollTo) scrollTo('#top')
    else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })

    // Return focus to the top of the document so keyboard users land where the
    // view now is, rather than being left at the button in the footer.
    const target = document.getElementById('main') || document.body
    target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  })
}
