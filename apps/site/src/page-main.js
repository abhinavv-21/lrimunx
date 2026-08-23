/**
 * Privacy, colophon and the 404 page.
 *
 * Three documents that need the nav, the footer and nothing else. One entry
 * rather than three, so they share a chunk instead of shipping the same two
 * modules three times.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import './styles/tokens.css'
import './styles/base.css'
import './styles/sections/nav.css'
import './styles/sections/doc.css'
import './styles/sections/footer.css'

import { initNav } from './modules/nav.js'
import { initFooter } from './modules/footer.js'

gsap.registerPlugin(ScrollTrigger)

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)
}

const ctx = {
  gsap,
  ScrollTrigger,
  lenis,
  reduced,
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
  fixFragmentLinks()
  initNav(ctx)
  initFooter(ctx)
}

/**
 * 404.html carries <base href="/">, because it is served for any unmatched path
 * and every relative href and hashed asset would otherwise resolve against that
 * path instead of the site root.
 *
 * The cost is that a fragment-only href resolves against the base too, so the
 * skip link would send a reader to the home page rather than past the nav on
 * the page they are actually on. Only that page has a <base>, so this is a
 * no-op everywhere else.
 */
function fixFragmentLinks() {
  if (!document.querySelector('base')) return

  const here = location.pathname + location.search
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.setAttribute('href', here + link.getAttribute('href'))
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
