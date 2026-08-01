/**
 * register-main.js — the entry point for register.html.
 *
 * A sibling of main.js, not a replacement for it. The two pages share the
 * cascade (tokens → base → nav/footer), the motion context and the nav and
 * footer modules; everything below that is different, because the landing page
 * is a composition and this one is a task.
 *
 * What is deliberately NOT here:
 *   · the preloader. register.html sets `app-ready` inline, before first paint.
 *     A ceremonial curtain in front of a form is a cost with no payoff.
 *   · hero, committees, oc and gallery — none of their markup exists here, and
 *     importing their stylesheets would ship ~30 KB of rules for elements that
 *     are not in the document.
 *   · initHeadings(). It splits `.section__title` into per-word masks; this page
 *     has one heading and it is not a section title.
 */

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import './styles/tokens.css'
import './styles/base.css'
import './styles/sections/nav.css'
import './styles/sections/footer.css'
import './styles/sections/register-page.css'
import './styles/sections/committee-select.css'
import './styles/sections/payment.css'

import { initNav } from './modules/nav.js'
import { initFooter } from './modules/footer.js'
import { initRegisterPage } from './modules/register-page.js'

gsap.registerPlugin(ScrollTrigger)

/* -------------------------------------------------------------------------
   Motion capability — read once, exactly as main.js does. Under reduced motion
   Lenis is never instantiated: hijacking native scroll is itself a vestibular
   issue, so the correct fallback is the browser's own scrolling.
   ------------------------------------------------------------------------- */
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const reduced = motionQuery.matches

if (!reduced) document.documentElement.classList.add('has-motion')

let lenis = null

if (!reduced) {
  lenis = new Lenis({
    duration: 1.05,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    syncTouch: false,
  })

  lenis.on('scroll', ScrollTrigger.update)

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000)
  })
  gsap.ticker.lagSmoothing(0)
}

const ctx = {
  gsap,
  ScrollTrigger,
  lenis,
  reduced,
  /**
   * Same contract as main.js: sections land FLUSH with the viewport top, and
   * Lenis is handed a NUMBER rather than an element — given an element it also
   * applies scroll-padding-top and the bar height is subtracted twice.
   */
  scrollTo(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target
    if (!el) return

    const top = el.getBoundingClientRect().top + window.scrollY

    if (lenis) {
      lenis.scrollTo(top, { duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 4) })
    } else {
      window.scrollTo({ top, behavior: 'auto' })
    }
  },
}

function boot() {
  initNav(ctx)
  initFooter(ctx)
  initRegisterPage(ctx)

  initAnchors()
  initReveals()

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh())
  }

  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })
}

/**
 * Anchor smooth-scroll, delegated from the document.
 *
 * Only same-page hashes are intercepted. Every nav and footer link on this page
 * is cross-document (./index.html#committees) and must be left to the browser —
 * `a[href^="#"]` already excludes them, and the guard below keeps that true if
 * one is ever rewritten.
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

    history.pushState(null, '', hash)
    target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  })
}

/**
 * The shared reveal — the page's four numbers, unchanged: start `top 94%`,
 * 26px of travel (--reveal-y, applied in base.css), 1.25s, expo.out, 0.075
 * stagger.
 *
 * Only the head band carries [data-reveal]. Form fields deliberately do not:
 * a control that animates in as you scroll towards it is a control you cannot
 * reach for, and on a page whose whole job is to get out of the way, the fields
 * are simply there from the first frame.
 */
const REVEAL = { start: 'top 94%', duration: 1.25, ease: 'expo.out', stagger: 0.075 }

function initReveals() {
  if (reduced) return

  const targets = gsap.utils.toArray('[data-reveal]')
  if (!targets.length) return

  ScrollTrigger.batch(targets, {
    start: REVEAL.start,
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: REVEAL.duration,
        ease: REVEAL.ease,
        stagger: REVEAL.stagger,
        overwrite: true,
        onComplete() {
          this.targets().forEach((el) => gsap.set(el, { clearProps: 'transform,opacity' }))
        },
      }),
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
