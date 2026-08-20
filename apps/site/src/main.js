import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import './styles/tokens.css'
import './styles/base.css'
import './styles/sections/nav.css'
import './styles/sections/hero.css'
import './styles/sections/committees.css'
import './styles/sections/committee-dialog.css'
import './styles/sections/oc.css'
import './styles/sections/gallery.css'
import './styles/sections/footer.css'

import { initNav } from './modules/nav.js'
import { initHero } from './modules/hero.js'
import { renderCommitteeCards } from './modules/committee-cards.js'
import { initCommittees } from './modules/committees.js'
import { initCommitteeDialog } from './modules/committee-dialog.js'
import { initOc } from './modules/oc.js'
import { initGallery } from './modules/gallery.js'
import { initFooter } from './modules/footer.js'

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

function boot() {
  initHero(ctx)
  initNav(ctx)
  renderCommitteeCards()
  initCommittees(ctx)
  initCommitteeDialog(ctx)
  initOc(ctx)
  initGallery(ctx)
  initFooter(ctx)

  initAnchors()
  initReveals()
  initHeadings(ctx)

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh())
  }

  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })

  revealApp()
}

const MIN_LOADER_MS = 1150

function revealApp() {
  const root = document.documentElement
  if (root.classList.contains('app-ready')) return

  const elapsed = performance.now()
  const wait = Math.max(0, MIN_LOADER_MS - elapsed)

  window.setTimeout(() => {
    root.classList.add('app-ready')

    document.dispatchEvent(new CustomEvent('lri:ready'))

    const loader = document.querySelector('[data-loader]')
    if (!loader) return

    const drop = () => loader.remove()
    if (reduced) {
      drop()
      return
    }

    loader.addEventListener('transitionend', drop, { once: true })
    window.setTimeout(drop, 1500)
  }, wait)
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

function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/)
  if (words.length < 2) return []

  const frag = document.createDocumentFragment()
  words.forEach((word, index) => {
    const mask = document.createElement('span')
    mask.className = 'mask-word'
    const inner = document.createElement('span')
    inner.textContent = word
    mask.append(inner)
    frag.append(mask)
    if (index < words.length - 1) frag.append(document.createTextNode(' '))
  })

  el.textContent = ''
  el.append(frag)
  return Array.from(el.querySelectorAll('.mask-word > span'))
}

function initHeadings({ gsap, ScrollTrigger, reduced }) {
  if (reduced) return

  document.querySelectorAll('.section__head').forEach((head) => {
    const section = head.closest('section')
    const eyebrow = head.querySelector('.section__eyebrow')
    const title = head.querySelector('.section__title')
    const lede = head.querySelector('.section__intro')
    const margin = section?.querySelector('.section__margin')

    const parts = [eyebrow, lede].filter(Boolean)
    const words = title ? splitWords(title) : []

    const titleFades = title && !words.length

    if (!parts.length && !title) return

    if (parts.length) gsap.set(parts, { opacity: 0, y: 26 })
    if (words.length) gsap.set(words, { yPercent: 118 })
    if (titleFades) gsap.set(title, { opacity: 0, y: 26 })
    if (eyebrow) gsap.set(eyebrow, { '--rule-scale': 0 })
    if (margin) gsap.set(margin, { opacity: 0, y: 16 })

    ScrollTrigger.create({
      trigger: head,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
        if (eyebrow) {
          tl.to(eyebrow, { opacity: 1, y: 0, duration: 0.75 }).to(
            eyebrow,
            { '--rule-scale': 1, duration: 0.66 },
            '-=0.58'
          )
        }
        if (words.length) {
          tl.to(words, { yPercent: 0, duration: 1.15, stagger: 0.045 }, '-=0.45')
        } else if (titleFades) {
          tl.to(title, { opacity: 1, y: 0, duration: 1.05 }, '-=0.45')
        }
        if (lede) tl.to(lede, { opacity: 1, y: 0, duration: 0.95 }, '-=0.85')
        if (margin) tl.to(margin, { opacity: 1, y: 0, duration: 0.85 }, '-=0.7')

        if (words.length) {
          tl.set(words, { clearProps: 'transform' }).set(title, { '--mask-clip': 'visible' })
        }
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
