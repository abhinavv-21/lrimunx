/**
 * main.js — the only entry point.
 *
 * Responsibilities, and nothing else:
 *   1. Load the stylesheet graph in cascade order (tokens → base → sections).
 *   2. Build the single motion context (gsap, ScrollTrigger, lenis, reduced).
 *   3. Hand that context to each section module.
 *   4. Own the two behaviours that genuinely are global: anchor smooth-scroll
 *      and the shared scroll-reveal batch.
 *
 * No module reaches for a global; the context is injected. That is what makes
 * each section independently testable — mount its markup, call its init.
 */

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import './styles/tokens.css'
import './styles/base.css'
import './styles/sections/nav.css'
import './styles/sections/hero.css'
import './styles/sections/committees.css'
import './styles/sections/oc.css'
import './styles/sections/gallery.css'
import './styles/sections/footer.css'

import { initNav } from './modules/nav.js'
import { initHero } from './modules/hero.js'
import { initCommittees } from './modules/committees.js'
import { initOc } from './modules/oc.js'
import { initGallery } from './modules/gallery.js'
import { initFooter } from './modules/footer.js'

gsap.registerPlugin(ScrollTrigger)

/* -------------------------------------------------------------------------
   Motion capability
   `reduced` is read once at boot. Under reduced motion Lenis is never
   instantiated at all — hijacking native scroll is itself a vestibular issue,
   so the correct fallback is the browser's own scrolling, not a slower Lenis.
   ------------------------------------------------------------------------- */
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const reduced = motionQuery.matches

// Gate the CSS start-states on JS *and* motion both being available, so that a
// no-JS or reduced-motion visitor never lands on a page of invisible elements.
if (!reduced) document.documentElement.classList.add('has-motion')

/* -------------------------------------------------------------------------
   Lenis — vertical only, driven off the GSAP ticker so there is exactly one
   rAF loop on the page and ScrollTrigger stays in sync with it.
   ------------------------------------------------------------------------- */
let lenis = null

if (!reduced) {
  lenis = new Lenis({
    duration: 1.05,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    // Native momentum on touch: smoothing it fights the platform and costs
    // more than it buys on low-end Android.
    syncTouch: false,
  })

  lenis.on('scroll', ScrollTrigger.update)

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000)
  })
  gsap.ticker.lagSmoothing(0)
}

/* -------------------------------------------------------------------------
   Shared context
   ------------------------------------------------------------------------- */
const ctx = {
  gsap,
  ScrollTrigger,
  lenis,
  reduced,
  /**
   * Scroll to an element or selector, clearing the sticky header.
   * Falls back to native scrolling when Lenis is absent (reduced motion).
   */
  scrollTo(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target
    if (!el) return

    // Land the section's top edge FLUSH with the viewport top — no nav-height
    // offset at all. Two bugs were hiding behind that offset:
    //
    //   1. Handing Lenis an element makes it apply the document's
    //      `scroll-padding-top` as well, so the bar height was subtracted twice
    //      and every jump stopped 71px short (measured: 144px instead of 73).
    //      Passing a NUMBER removes its element resolution entirely.
    //   2. Even once corrected, reserving the bar's height exposed a strip of
    //      the PREVIOUS section — because the bar hides itself on downward
    //      scroll, so the space it had reserved was left showing.
    //
    // Every section carries a --section-y top padding of 88–176px, comfortably
    // more than the bar, so the heading is never covered.
    const top = el.getBoundingClientRect().top + window.scrollY

    if (lenis) {
      lenis.scrollTo(top, { duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 4) })
    } else {
      window.scrollTo({ top, behavior: 'auto' })
    }
  },
}

/* -------------------------------------------------------------------------
   Boot
   Order matters: modules that render DOM (oc, gallery) must run before the
   reveal batch is registered, otherwise their cards are never picked up.
   ------------------------------------------------------------------------- */
function boot() {
  initHero(ctx)
  initNav(ctx)
  initCommittees(ctx)
  initOc(ctx)
  initGallery(ctx)
  initFooter(ctx)

  initAnchors()
  initReveals()
  initHeadings(ctx)

  // Fonts swapping in changes text metrics, which changes every trigger start.
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh())
  }

  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })

  revealApp()
}

/* -------------------------------------------------------------------------
   Preloader handover.

   The curtain is painted from inline CSS in index.html, before this bundle
   exists — that is the whole point of it, and why the page no longer flashes
   raw HTML. This function takes it back down once the app is actually ready,
   holding it for a minimum beat so it reads as a deliberate open rather than
   a flicker on a fast connection. Note this is a hard floor on LCP, so it buys
   presentation at a measurable cost — keep it under ~1.2s.
   ------------------------------------------------------------------------- */
const MIN_LOADER_MS = 1150

function revealApp() {
  const root = document.documentElement
  if (root.classList.contains('app-ready')) return

  const elapsed = performance.now()
  const wait = Math.max(0, MIN_LOADER_MS - elapsed)

  window.setTimeout(() => {
    root.classList.add('app-ready')

    // The hero holds its load choreography until the curtain is off the way,
    // so the two are one continuous gesture rather than two competing ones.
    document.dispatchEvent(new CustomEvent('lri:ready'))

    const loader = document.querySelector('[data-loader]')
    if (!loader) return
    const drop = () => loader.remove()
    if (reduced) drop()
    else loader.addEventListener('transitionend', drop, { once: true })
  }, wait)
}

/**
 * Anchor smooth-scroll. Delegated from the document so links rendered later by
 * a module are covered without re-binding.
 */
function initAnchors() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]')
    if (!link) return

    const hash = link.getAttribute('href')
    if (!hash || hash === '#') return

    const target = document.querySelector(hash)
    if (!target) return

    event.preventDefault()
    ctx.scrollTo(target)

    // Keep the URL and, more importantly, keyboard focus in step with the view.
    history.pushState(null, '', hash)
    target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  })
}

/**
 * The one shared reveal. `ScrollTrigger.batch` groups everything in view into a
 * single stagger rather than creating one trigger per element — 40+ revealing
 * elements on this page would otherwise mean 40+ triggers.
 *
 * Transform + opacity only, played once, never reversed on scroll-up.
 */
function initReveals() {
  if (reduced) return

  const targets = gsap.utils.toArray('[data-reveal]')
  if (!targets.length) return

  ScrollTrigger.batch(targets, {
    start: 'top 85%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 1.1,
        // expo.out has a long, late tail — the same curve as --ease-expo in the
        // stylesheet, so scripted and CSS motion feel like one system.
        ease: 'expo.out',
        stagger: 0.08,
        overwrite: true,
        // Drop the inline transform once it has served its purpose so nothing
        // is left composited for the rest of the session.
        onComplete() {
          this.targets().forEach((el) => gsap.set(el, { clearProps: 'transform,opacity' }))
        },
      }),
  })
}

/**
 * Section headings — a sequenced unroll rather than one fade.
 *
 * Three beats that overlap: the eyebrow rule draws, the heading rises into it,
 * and the marginal apparatus (gold numeral + vertical rule) resolves last. The
 * negative offsets are the point — three beats that breathe into each other
 * read composed; three sequential beats read like a loading spinner.
 *
 * Previously section headings had no scroll animation at all: only elements
 * carrying `data-reveal` were picked up, and the heads carried none, so every
 * section title simply existed.
 */
function initHeadings({ gsap, ScrollTrigger, reduced }) {
  if (reduced) return

  document.querySelectorAll('.section__head').forEach((head) => {
    const section = head.closest('section')
    const eyebrow = head.querySelector('.section__eyebrow')
    const title = head.querySelector('.section__title')
    const lede = head.querySelector('.section__intro')
    const margin = section?.querySelector('.section__margin')

    const parts = [eyebrow, title, lede].filter(Boolean)
    if (!parts.length) return

    gsap.set(parts, { opacity: 0, y: 22 })
    if (eyebrow) gsap.set(eyebrow, { '--rule-scale': 0 })
    if (margin) gsap.set(margin, { opacity: 0, y: 14 })

    ScrollTrigger.create({
      trigger: head,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
        if (eyebrow) {
          tl.to(eyebrow, { opacity: 1, y: 0, duration: 0.7 })
            .to(eyebrow, { '--rule-scale': 1, duration: 0.62 }, '-=0.55')
        }
        if (title) tl.to(title, { opacity: 1, y: 0, duration: 0.95 }, '-=0.42')
        if (lede) tl.to(lede, { opacity: 1, y: 0, duration: 0.85 }, '-=0.7')
        if (margin) tl.to(margin, { opacity: 1, y: 0, duration: 0.8 }, '-=0.6')
        tl.set([...parts, margin].filter(Boolean), { clearProps: 'transform' })
      },
    })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
