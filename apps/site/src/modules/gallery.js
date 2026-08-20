/**
 * Flip to true when the photographs are actually in
 * assets/past-galleries/edition-01/01.jpg through edition-09/01.jpg.
 *
 * While it is false the section renders the edition marquee and a link to
 * Instagram, and the grid and the per-edition filters are not built at all.
 * With it true and the files absent, the section is nine broken plates and ten
 * filter buttons that each resolve to a single broken plate, under a live status
 * line announcing "Showing 1 item from edition III." That reads as a build
 * failure rather than as work in progress.
 */
const PHOTOS_PUBLISHED = false

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']

const RATIOS = ['4 / 5', '3 / 2', '1 / 1', '4 / 3', '5 / 4', '3 / 4']

const PHOTOS = ROMAN.map((roman, index) => {
  const folder = `edition-${String(index + 1).padStart(2, '0')}`
  return {
    type: 'photo',
    edition: roman,
    editionIndex: index + 1,
    src: `${import.meta.env.BASE_URL}assets/past-galleries/${folder}/01.jpg`,
    ratio: RATIOS[index % RATIOS.length],
    alt: `A moment from LRI Model UN edition ${roman}.`,
    caption: 'Conference floor',
  }
})

/**
 * Delegate testimonials. Empty on purpose: the three that used to sit here were
 * all placeholders reading "Delegate review to be added", and three identical
 * blank cards read worse than none at all.
 *
 * To bring them back, add entries in this shape and they will be spliced back
 * into the grid at the positions below:
 *   { type: 'quote', edition: 'IX', editionIndex: 9,
 *     text: '...', name: '...', meta: 'Committee · Edition IX' }
 *
 * Only ship a real quote from a real delegate, with their permission.
 */
const QUOTES = []

// Quotes are spliced between photographs rather than grouped, so the grid
// keeps its rhythm. Positions are applied back to front so each index still
// refers to the original photo order, and any that overshoot a short list are
// skipped rather than appended in the wrong place.
const QUOTE_POSITIONS = [2, 7, 11]

const ITEMS = (() => {
  const out = [...PHOTOS]

  QUOTE_POSITIONS.forEach((position, index) => {
    const quote = QUOTES[index]
    if (quote && position <= out.length) out.splice(position, 0, quote)
  })

  return out
})()

const ROW_UNIT = 8

export function initGallery({ gsap, ScrollTrigger, reduced }) {
  const root = document.querySelector('[data-gallery-root]')
  if (!root) return

  buildMarquee()

  if (!PHOTOS_PUBLISHED) {
    root.append(renderPendingArchive())
    return
  }

  const filters = renderFilters()
  const grid = renderGrid()
  const status = document.createElement('p')
  status.className = 'gallery__status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  root.append(filters, grid, status)

  const items = Array.from(grid.children)

  let queued = false

  function layout() {
    queued = false

    const visible = items.filter((item) => !item.hidden)
    const rowGap = parseFloat(getComputedStyle(grid).rowGap) || 0

    const spans = visible.map((item) => {
      const marginBottom = parseFloat(getComputedStyle(item).marginBlockEnd) || 0
      return Math.ceil((item.getBoundingClientRect().height + marginBottom + rowGap) / ROW_UNIT)
    })

    let changed = false
    visible.forEach((item, index) => {
      const next = `span ${spans[index]}`
      if (item.style.gridRowEnd === next) return
      item.style.gridRowEnd = next
      changed = true
    })

    if (changed) ScrollTrigger.refresh()
  }

  function scheduleLayout() {
    if (queued) return
    queued = true
    requestAnimationFrame(layout)
  }

  const ro = new ResizeObserver(scheduleLayout)
  ro.observe(grid)
  items.forEach((item) => {
    const img = item.querySelector('img')
    if (!img) return
    img.addEventListener('load', scheduleLayout, { once: true })
    img.addEventListener(
      'error',
      () => {
        img.closest('.media-plate')?.classList.add('is-missing')
        scheduleLayout()
      },
      { once: true }
    )
  })

  const buttons = Array.from(filters.querySelectorAll('.gallery__filter'))

  function applyFilter(value) {
    buttons.forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.filter === value))
    )

    let shown = 0
    items.forEach((item) => {
      const match = value === 'all' || item.dataset.edition === value
      item.hidden = !match
      if (match) shown += 1
    })

    status.textContent =
      value === 'all'
        ? `Showing all ${shown} items from editions I–IX.`
        : `Showing ${shown} item${shown === 1 ? '' : 's'} from edition ${value}.`

    layout()
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => applyFilter(button.dataset.filter))
  })

  applyFilter('all')

  if (!reduced) {
    gsap.set(items, { opacity: 0, y: 26 })
    ScrollTrigger.batch(items, {
      start: 'top 94%',
      once: true,
      onEnter: (batch) =>
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 1.15,
          ease: 'expo.out',
          stagger: 0.06,
          clearProps: 'transform',
        }),
    })
  }
}

function buildMarquee() {
  const track = document.querySelector('[data-gallery-marquee-track]')
  if (!track) return

  const sequence = [...ROMAN, 'X']
  const run = sequence
    .map(
      (roman) =>
        `<span class="gallery__marquee-item${roman === 'X' ? ' gallery__marquee-item--current' : ''}">${roman}<span class="gallery__marquee-sep"></span></span>`
    )
    .join('')

  track.innerHTML = run + run
}

function renderFilters() {
  const wrap = document.createElement('div')
  wrap.className = 'gallery__filters'
  wrap.setAttribute('role', 'group')
  wrap.setAttribute('aria-label', 'Filter the archive by edition')

  const label = document.createElement('p')
  label.className = 'label gallery__filters-label'
  label.textContent = 'Edition'
  wrap.append(label)

  const values = ['all', ...ROMAN]
  values.forEach((value) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'gallery__filter'
    button.dataset.filter = value
    button.setAttribute('aria-pressed', String(value === 'all'))
    button.textContent = value === 'all' ? 'All' : value
    wrap.append(button)
  })

  return wrap
}

function renderGrid() {
  const grid = document.createElement('ul')
  grid.className = 'gallery__grid'
  grid.setAttribute('aria-label', 'Photographs and reviews from editions I to IX')

  ITEMS.forEach((item) => {
    const li = document.createElement('li')
    li.className = 'gallery__item'
    li.dataset.edition = item.edition

    if (item.type === 'quote') {
      li.innerHTML = `
        <figure class="gallery__quote${item.editionIndex % 2 === 0 ? ' gallery__quote--tint' : ''}">
          <span class="gallery__quote-mark" aria-hidden="true">&ldquo;</span>
          <blockquote class="gallery__quote-text"><p>${item.text}</p></blockquote>
          <figcaption class="gallery__quote-attr">
            <span class="gallery__quote-name">${item.name}</span>
            ${item.meta}
          </figcaption>
        </figure>
      `
    } else {
      li.innerHTML = `
        <figure class="gallery__frame media-plate" style="aspect-ratio:${item.ratio}">
          <img src="${item.src}" alt="${item.alt}" loading="lazy" decoding="async" />
          <span class="media-plate__fallback" aria-hidden="true">${item.edition}</span>
          <figcaption class="gallery__caption">
            <span class="gallery__caption-edition" aria-hidden="true">${item.edition}</span>
            <span class="gallery__caption-text">Edition ${item.edition} · ${item.caption}</span>
          </figcaption>
        </figure>
      `
    }

    grid.append(li)
  })

  return grid
}

/**
 * The archive section without photographs. The marquee above it already carries
 * the proof that matters (ten editions, nine of them past), so this adds the one
 * place the photographs actually are today rather than nine empty frames.
 */
function renderPendingArchive() {
  const wrap = document.createElement('div')
  wrap.className = 'gallery__pending'

  wrap.innerHTML = `
    <p class="gallery__pending-note">
      Photographs from the first nine editions are being collected and scanned.
    </p>
    <a
      class="gallery__pending-link"
      href="https://www.instagram.com/lrimunx/"
      target="_blank"
      rel="noopener noreferrer"
    >
      See past editions on Instagram
      <span aria-hidden="true">@lrimunx</span>
    </a>
  `

  return wrap
}
