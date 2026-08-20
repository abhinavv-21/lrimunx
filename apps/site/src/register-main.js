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
import { COMMITTEES } from './data/committees.js'

gsap.registerPlugin(ScrollTrigger)

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

const NUMBER_WORDS = [
  'No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six',
  'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
]

function boot() {
  initNav(ctx)
  initFooter(ctx)
  initRegisterPage(ctx)

  // Keeps the hint honest when a committee is added to src/data/committees.js.
  const count = document.querySelector('[data-committee-count]')
  if (count) count.textContent = NUMBER_WORDS[COMMITTEES.length] ?? String(COMMITTEES.length)

  initAnchors()
  initReveals()

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh())
  }

  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })
}

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
          this.targets().forEach((el) => {
            el.removeAttribute('data-reveal')
            gsap.set(el, { clearProps: 'transform,opacity' })
          })
        },
      }),
  })

  const catchUp = () => {
    ScrollTrigger.refresh()
    targets.forEach((el) => {
      const box = el.getBoundingClientRect()
      const onScreen = box.top < window.innerHeight && box.bottom > 0
      if (onScreen && Number(getComputedStyle(el).opacity) === 0) {
        el.removeAttribute('data-reveal')
        gsap.set(el, { clearProps: 'transform,opacity' })
      }
    })
  }

  window.addEventListener('load', catchUp, { once: true })
  window.setTimeout(catchUp, 1400)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
