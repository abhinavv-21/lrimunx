/**
 * hero.js — the struck seal: load choreography, the wreath draw-on, and a
 * genuinely seamless ribbon.
 *
 * The hero owns the only load-triggered animation on the page. It waits for
 * `lri:ready` — dispatched by main.js when the preloader curtain lifts — so the
 * masthead rises into a page that is already there rather than racing it.
 *
 * There is no hero video and no raster emblem above the fold: the LCP element
 * is the masthead text, and the seal is inline SVG, so nothing in the opening
 * composition waits on a network request.
 */

// Decorative ribbon across the foot of the hero. Factual content only.
const RIBBON = [
  'LRI Model UN X',
  'Tenth Edition',
  'LRI School',
  'Kalanki · Kathmandu',
  'Model United Nations',
]

const RIBBON_SPEED = 46 // px per second — constant regardless of track length

export function initHero({ gsap, ScrollTrigger, reduced }) {
  const hero = document.querySelector('.hero')
  if (!hero) return

  const wash = hero.querySelector('.hero__wash')
  const lines = Array.from(hero.querySelectorAll('[data-hero-line] > *'))
  const seal = hero.querySelector('[data-hero-seal]')
  const wreathPaths = Array.from(hero.querySelectorAll('.hero__seal-wreath path'))

  const ribbon = new Ribbon(hero)
  ribbon.build()
  ribbon.observe()

  // Fonts change text metrics, which changes the measured run width.
  if (document.fonts?.ready) document.fonts.ready.then(() => ribbon.build())

  let lastWidth = window.innerWidth
  let resizeIdle
  window.addEventListener(
    'resize',
    () => {
      // Width-only guard. On Android Chrome the URL bar showing/hiding fires
      // `resize` on every scroll direction change; rebuilding the ribbon there
      // restarted its animation from zero and produced a visible snap.
      if (window.innerWidth === lastWidth) return
      lastWidth = window.innerWidth
      clearTimeout(resizeIdle)
      resizeIdle = setTimeout(() => ribbon.build(), 180)
    },
    { passive: true }
  )

  // The hero runs its own load timeline, so take its elements out of the
  // shared scroll-reveal batch registered later in main.js.
  const staged = Array.from(hero.querySelectorAll('[data-reveal]'))

  if (reduced) {
    staged.forEach((el) => el.removeAttribute('data-reveal'))
    return
  }

  gsap.set(staged, { opacity: 0, y: 16 })
  staged.forEach((el) => el.removeAttribute('data-reveal'))

  // Prime the wreath for the draw. Measuring here rather than in CSS because
  // each path has its own length.
  const dashes = wreathPaths.map((path) => {
    const len = path.getTotalLength()
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len })
    return len
  })

  const numeral = hero.querySelector('.hero__seal-numeral')
  const caption = hero.querySelector('.hero__seal-caption')
  if (numeral) gsap.set(numeral, { opacity: 0, scale: 0.94 })
  if (caption) gsap.set(caption, { opacity: 0 })

  /* --------------------------------------------------------------------
     Load choreography, played once the curtain is up.
     -------------------------------------------------------------------- */
  function play() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })

    if (lines.length) {
      // fromTo, not to: GSAP resolves the CSS `translate3d(0, 110%, 0)` start
      // state into pixels and caches it as `y`, so animating yPercent alone
      // would leave that pixel baseline in place and the headline would finish
      // the tween still hidden below its mask. `y: 0` discards the baseline.
      tl.fromTo(
        lines,
        { y: 0, yPercent: 110 },
        {
          yPercent: 0,
          duration: 1.3,
          stagger: 0.1,
          onComplete() {
            gsap.set(lines, { willChange: 'auto' })
          },
        }
      )
    }

    // The wreath grows from the ribbon at its foot toward the open crown —
    // a laurel actually growing, which is the opposite of a logo spinning.
    // `stroke-dashoffset` is NOT compositor-accelerated, so this runs once on
    // load and never on a scroll scrub.
    if (wreathPaths.length) {
      tl.to(
        wreathPaths,
        {
          strokeDashoffset: 0,
          duration: 1.4,
          ease: 'power2.inOut',
          stagger: { each: 0.012, from: 'start' },
          onComplete() {
            // Release the dash once drawn; it has no job afterwards.
            gsap.set(wreathPaths, { strokeDasharray: 'none', strokeDashoffset: 0 })
          },
        },
        '-=1.0'
      )
    }

    if (numeral) {
      tl.to(numeral, { opacity: 1, scale: 1, duration: 0.9 }, '-=0.85')
    }
    if (caption) {
      tl.to(caption, { opacity: 1, duration: 0.6 }, '-=0.5')
    }

    if (staged.length) {
      tl.to(
        staged,
        { opacity: 1, y: 0, duration: 1, stagger: 0.09, clearProps: 'transform' },
        '-=1.1'
      )
    }

    return tl
  }

  document.addEventListener('lri:ready', play, { once: true })
  // If the curtain was already dismissed (the safety timer fired first), the
  // event has been and gone — start immediately rather than never.
  if (document.documentElement.classList.contains('app-ready')) play()

  /* --------------------------------------------------------------------
     Parallax. Two layers only, and `will-change` is applied for the life of
     the scrub rather than permanently.
     -------------------------------------------------------------------- */
  const layers = [
    [wash, 12],
    [seal, 6], // a whisper, so the seal feels seated in the page
  ]

  layers.forEach(([el, distance]) => {
    if (!el) return
    gsap.to(el, {
      yPercent: distance,
      ease: 'none',
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
        invalidateOnRefresh: true,
        onToggle: ({ isActive }) => {
          el.style.willChange = isActive ? 'transform' : 'auto'
        },
      },
    })
  })

  const cue = hero.querySelector('[data-hero-cue]')
  if (cue) {
    // A scrubbed tween, not a new tween allocated on every scroll frame.
    gsap.to(cue, {
      opacity: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom 70%',
        scrub: true,
      },
    })
  }
}

/**
 * The endorsement ribbon.
 *
 * A marquee that duplicates its content exactly twice and translates -50% only
 * looks seamless when one copy is already wider than the viewport. Below that
 * the copy runs out mid-screen and you see it jump back.
 *
 * So: measure one run, repeat it until the track is at least twice the
 * container wide, and keep the count EVEN so -50% lands precisely on a copy
 * boundary. Duration is derived from the final width at a fixed pixel speed, so
 * a longer track scrolls for longer rather than faster.
 */
class Ribbon {
  constructor(hero) {
    this.root = hero.querySelector('[data-hero-ribbon-root]')
    this.track = hero.querySelector('[data-hero-ribbon]')
    this.runHtml = RIBBON.map(
      (text) =>
        `<span class="hero__ribbon-item">${text}<span class="hero__ribbon-star" aria-hidden="true">✦</span></span>`
    ).join('')
  }

  build() {
    const { track } = this
    if (!track) return

    const container = track.parentElement
    if (!container) return

    track.style.animation = 'none'
    track.innerHTML = this.runHtml
    const runWidth = track.scrollWidth
    if (!runWidth) return

    let copies = Math.max(2, Math.ceil((container.offsetWidth * 2) / runWidth))
    if (copies % 2 !== 0) copies += 1 // -50% must land on a copy boundary

    track.innerHTML = this.runHtml.repeat(copies)
    track.style.animation = ''
    track.style.setProperty('--ribbon-duration', `${(runWidth * (copies / 2)) / RIBBON_SPEED}s`)
  }

  /** An infinite animation keeps its layer alive and ticking forever; pause it
   *  once it has left the viewport. Measurable on low-end Android. */
  observe() {
    if (!this.root || !('IntersectionObserver' in window)) return
    new IntersectionObserver(
      ([entry]) => this.root.classList.toggle('is-onscreen', entry.isIntersecting),
      { rootMargin: '100px' }
    ).observe(this.root)
  }
}
