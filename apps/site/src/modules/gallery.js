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
    alt: `LRI Model UN edition ${roman}. PLACEHOLDER alt text.`,
    caption: 'Conference floor',
  }
})

const QUOTES = [
  {
    type: 'quote',
    edition: 'IX',
    editionIndex: 9,
    text: 'Delegate review to be added.',
    name: 'Name to be announced',
    meta: 'Committee to be announced · Edition IX',
  },
  {
    type: 'quote',
    edition: 'VII',
    editionIndex: 7,
    text: 'Delegate review to be added.',
    name: 'Name to be announced',
    meta: 'Committee to be announced · Edition VII',
  },
  {
    type: 'quote',
    edition: 'IV',
    editionIndex: 4,
    text: 'Delegate review to be added.',
    name: 'Name to be announced',
    meta: 'Committee to be announced · Edition IV',
  },
]

const ITEMS = (() => {
  const out = [...PHOTOS]
  out.splice(2, 0, QUOTES[0])
  out.splice(7, 0, QUOTES[1])
  out.splice(11, 0, QUOTES[2])
  return out
})()

const ROW_UNIT = 8

export function initGallery({ gsap, ScrollTrigger, reduced }) {
  const root = document.querySelector('[data-gallery-root]')
  if (!root) return

  buildMarquee()

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
