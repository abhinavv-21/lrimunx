/**
 * The past editions page.
 *
 * The archive used to be a section on the landing page. It is its own page now,
 * so this entry carries only the chrome it needs plus the gallery: no hero, no
 * committee grid, no organising committee.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import './styles/tokens.css'
import './styles/base.css'
import './styles/sections/nav.css'
import './styles/sections/gallery.css'
import './styles/sections/editions-page.css'
import './styles/sections/footer.css'

import { initNav } from './modules/nav.js'
import { initGallery } from './modules/gallery.js'
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
  initNav(ctx)
  initGallery(ctx)
  initFooter(ctx)

  if (document.fonts?.ready) document.fonts.ready.then(() => ScrollTrigger.refresh())
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
