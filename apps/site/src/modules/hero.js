// The headline now says "LRI Model United Nations" at full size, so the ribbon
// carries only what the headline does not.
const RIBBON = ['Tenth Edition', 'Kalanki · Kathmandu', '21–23 November 2026']

const RIBBON_SPEED = 46

export function initHero({ gsap, reduced }) {
  const hero = document.querySelector('.hero')
  if (!hero) return

  const wash = hero.querySelector('.hero__wash')
  const lines = Array.from(hero.querySelectorAll('[data-hero-line] > *'))
  const seal = hero.querySelector('[data-hero-seal]')
  const wreathPaths = Array.from(hero.querySelectorAll('.hero__seal-wreath path'))

  const ribbon = new Ribbon(hero)
  ribbon.build()
  ribbon.observe()

  if (document.fonts?.ready) document.fonts.ready.then(() => ribbon.build())

  let lastWidth = window.innerWidth
  let resizeIdle
  window.addEventListener(
    'resize',
    () => {
      if (window.innerWidth === lastWidth) return
      lastWidth = window.innerWidth
      clearTimeout(resizeIdle)
      resizeIdle = setTimeout(() => ribbon.build(), 180)
    },
    { passive: true }
  )

  const staged = Array.from(hero.querySelectorAll('[data-reveal]'))

  if (reduced) {
    staged.forEach((el) => el.removeAttribute('data-reveal'))
    return
  }

  gsap.set(staged, { opacity: 0, y: 26 })
  staged.forEach((el) => el.removeAttribute('data-reveal'))

  wreathPaths.forEach((path) => {
    const len = path.getTotalLength()
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len })
  })

  const numeral = hero.querySelector('.hero__seal-numeral')
  const caption = hero.querySelector('.hero__seal-caption')
  if (numeral) gsap.set(numeral, { opacity: 0, scale: 0.94 })
  if (caption) gsap.set(caption, { opacity: 0 })

  function play() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })

    if (lines.length) {
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

    if (wreathPaths.length) {
      tl.to(
        wreathPaths,
        {
          strokeDashoffset: 0,
          duration: 1.4,
          ease: 'power2.inOut',
          stagger: { each: 0.012, from: 'start' },
          onComplete() {
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

  if (document.documentElement.classList.contains('app-ready')) play()

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
    if (copies % 2 !== 0) copies += 1

    track.innerHTML = this.runHtml.repeat(copies)
    track.style.animation = ''
    track.style.setProperty('--ribbon-duration', `${(runWidth * (copies / 2)) / RIBBON_SPEED}s`)
  }

  observe() {
    if (!this.root || !('IntersectionObserver' in window)) return
    new IntersectionObserver(
      ([entry]) => this.root.classList.toggle('is-onscreen', entry.isIntersecting),
      { rootMargin: '100px' }
    ).observe(this.root)
  }
}
