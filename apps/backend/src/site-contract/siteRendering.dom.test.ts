/**
 * @vitest-environment jsdom
 *
 * The landing page used to carry 331 lines of committee markup inline. It is
 * now built at runtime by committee-cards.js, so if that module stops producing
 * what committees.css and committee-dialog.js expect, the section renders empty
 * and nothing else in the repository notices.
 *
 * apps/site has no test runner of its own and is not part of `npm test`, so
 * these live in the backend suite, which is the only vitest project that runs
 * plain JS from the site workspace. Move them to apps/site the moment that
 * workspace gets a vitest config.
 *
 * The DOM is the real apps/site/index.html, not a hand-written fixture, so a
 * container renamed in the HTML fails here rather than silently at runtime.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error -- plain ESM from the site workspace, no types by design
import { renderCommitteeCards } from '../../../site/src/modules/committee-cards.js'
// @ts-expect-error -- plain ESM from the site workspace, no types by design
import { initCommittees } from '../../../site/src/modules/committees.js'
// @ts-expect-error -- plain ESM from the site workspace, no types by design
import { initCommitteeDialog } from '../../../site/src/modules/committee-dialog.js'
// @ts-expect-error -- plain ESM from the site workspace, no types by design
import { initGallery } from '../../../site/src/modules/gallery.js'
// @ts-expect-error -- plain ESM from the site workspace, no types by design
import { initOc } from '../../../site/src/modules/oc.js'
// @ts-expect-error -- plain ESM from the site workspace, no types by design
import { COMMITTEES, metaLine } from '../../../site/src/data/committees.js'

interface Committee {
  code: string
  name: string
  icon: string
  kind: string
  level: string
  seats: number
  seatNoun: string
  meta: string[]
  blurb: string
  agenda: string | null
}

const catalogue = COMMITTEES as Committee[]

const here = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(here, '../../../site')

const bodyOf = (name: string) =>
  readFileSync(path.join(siteRoot, name), 'utf8')
    .replace(/[\s\S]*<body[^>]*>/i, '')
    .replace(/<\/body>[\s\S]*/i, '')

const BODY = bodyOf('index.html')

/** The archive is its own page now, so the gallery tests need its DOM. */
const EDITIONS_BODY = bodyOf('editions.html')

/** Enough of gsap for the modules under test; none of them assert on animation. */
function stubGsap() {
  const noop = vi.fn()
  return {
    gsap: { set: noop, to: noop, from: noop, killTweensOf: noop, utils: { toArray: (v: unknown) => (Array.isArray(v) ? v : []) } },
    ScrollTrigger: { create: noop, batch: noop, refresh: noop, update: noop },
    reduced: true,
  }
}

beforeEach(() => {
  document.body.innerHTML = BODY
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('the committee grid on index.html', () => {
  it('has the container the renderer looks for, so the section is not silently empty', () => {
    expect(document.querySelector('[data-committees-grid]')).not.toBeNull()
    expect(document.querySelector('[data-committees-eyebrow]')).not.toBeNull()
  })

  it('ships no hardcoded committee markup: the grid starts empty', () => {
    const grid = document.querySelector('[data-committees-grid]') as HTMLElement
    expect(grid.querySelectorAll('[data-committee]')).toHaveLength(0)
  })

  it('renders one card per committee, in catalogue order', () => {
    renderCommitteeCards()
    const cards = Array.from(document.querySelectorAll('[data-committee]')) as HTMLElement[]
    expect(cards).toHaveLength(14)
    expect(cards.map((c) => c.dataset['code'])).toEqual(catalogue.map((c) => c.code))
  })

  it('is idempotent, so a second render does not double the grid', () => {
    renderCommitteeCards()
    renderCommitteeCards()
    expect(document.querySelectorAll('[data-committee]')).toHaveLength(14)
  })

  it('points every icon at a file that exists in assets/icons', () => {
    renderCommitteeCards()
    const missing: string[] = []
    document.querySelectorAll('.committee__icon').forEach((img) => {
      const src = (img as HTMLImageElement).getAttribute('src') ?? ''
      const file = path.join(siteRoot, src.replace(/^[./]*/, ''))
      if (!existsSync(file)) missing.push(src)
    })
    expect(missing).toEqual([])
  })

  it('gives committee-dialog every node it reads back out of a card', () => {
    renderCommitteeCards()
    const card = document.querySelector('[data-committee]') as HTMLElement
    for (const selector of [
      '.committee__card',
      '.committee__icon',
      '.committee__abbr',
      '.committee__code',
      '.committee__kind',
      '.committee__name',
      '.committee__blurb',
      '.committee__seats',
      '.tag',
      '[data-committee-open]',
    ]) {
      expect(card.querySelector(selector), `card is missing ${selector}`).not.toBeNull()
    }

    // The agenda block used to be a hidden .committee__reveal panel inside the
    // card, which the dialog scraped back out of the DOM. The panel is gone and
    // the same content rides on the element as data, so these are now the
    // nodes-that-are-not-nodes the dialog reads.
    for (const key of ['blockLabel', 'blockText', 'blockNote']) {
      expect(card.dataset[key], `card is missing data-${key}`).toBeTruthy()
    }
    expect(card.dataset['chair']).toBe('To be announced')
    expect(card.dataset['viceChair']).toBe('To be announced')
  })

  it('leads the block on format while every agenda is still null', () => {
    expect(catalogue.every((c) => c.agenda === null)).toBe(true)
    renderCommitteeCards()

    const cards = Array.from(document.querySelectorAll('[data-committee]')) as HTMLElement[]

    expect(new Set(cards.map((c) => c.dataset['blockLabel']))).toEqual(new Set(['Format']))
    expect(cards.map((c) => c.dataset['blockText'])).toEqual(
      catalogue.map((c) => c.meta.join(', ')),
    )
    expect(new Set(cards.map((c) => c.dataset['blockNote']))).toEqual(
      new Set(['Agenda to be announced.']),
    )
  })

  it('prints the seat count and noun from the catalogue', () => {
    renderCommitteeCards()
    const figures = Array.from(document.querySelectorAll('.committee__seats-figure')).map(
      (el) => el.textContent,
    )
    const nouns = Array.from(document.querySelectorAll('.committee__seats-noun')).map(
      (el) => el.textContent,
    )
    expect(figures).toEqual(catalogue.map((c) => String(c.seats)))
    expect(nouns).toEqual(catalogue.map((c) => c.seatNoun))
    expect(metaLine(catalogue[0])).toBe('15 seats · Position paper required')
  })

  it('keeps the code and the room kind in separate elements', () => {
    renderCommitteeCards()
    const codes = Array.from(document.querySelectorAll('.committee__code')).map((el) => el.textContent)
    const kinds = Array.from(document.querySelectorAll('.committee__kind')).map((el) => el.textContent)
    expect(codes).toEqual(catalogue.map((c) => c.code))
    expect(kinds).toEqual(catalogue.map((c) => c.kind))
  })

  it('spells the eyebrow count from the list instead of hardcoding it', () => {
    const eyebrow = document.querySelector('[data-committees-eyebrow]') as HTMLElement
    renderCommitteeCards()
    expect(eyebrow.textContent).toBe('Fourteen committees')
  })

  it('survives initCommittees, which no longer measures anything', () => {
    // The position readout, the progress bar and the arrows went with the rail.
    // What is left is the entry animation, and the contract that matters is
    // that running it does not disturb the cards the renderer just wrote.
    renderCommitteeCards()
    initCommittees(stubGsap())
    expect(document.querySelectorAll('[data-committee]')).toHaveLength(catalogue.length)
  })

  it('escapes card text rather than injecting it raw', () => {
    renderCommitteeCards()
    // No committee name or blurb currently holds a character that has to be
    // escaped, so this asserts the general rule rather than one string: nothing
    // out of the catalogue reaches the DOM as markup.
    const text = Array.from(
      document.querySelectorAll('.committee__name, .committee__blurb, .committee__kind'),
    ) as HTMLElement[]
    expect(text.length).toBe(catalogue.length * 3)
    for (const el of text) expect(el.innerHTML).toBe(el.textContent)
  })
})

describe('the details dialog, filled from a rendered card', () => {
  /** Opens the dialog for one committee and returns the dialog element. */
  function openCard(code: string): HTMLElement {
    // jsdom has no modal dialog, and the dialog module only needs open/close.
    const proto = window.HTMLDialogElement.prototype as unknown as Record<string, unknown>
    proto['showModal'] = function showModal(this: HTMLDialogElement) {
      this.open = true
    }
    proto['close'] = function close(this: HTMLDialogElement) {
      this.open = false
    }

    renderCommitteeCards()
    initCommitteeDialog(stubGsap())

    const card = document.querySelector(`[data-committee][data-code="${code}"]`) as HTMLElement
    const button = card.querySelector('[data-committee-open]') as HTMLElement
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))

    return document.querySelector('[data-committee-dialog]') as HTMLElement
  }

  it('opens with the committee that was clicked', () => {
    const dialog = openCard('UNSC')
    expect((dialog.querySelector('#cdlg-name') as HTMLElement).textContent).toBe(
      'United Nations Security Council',
    )
    expect((dialog.querySelector('[data-cdlg-apply]') as HTMLAnchorElement).getAttribute('href')).toBe(
      './register?committee=UNSC',
    )
  })

  it('BUG: the code line picks up the room kind as well as the code', () => {
    const dialog = openCard('UNSC')
    // committee-dialog.js:35 reads .committee__abbr, which committee-cards.js now
    // splits into .committee__code and .committee__kind. It should read
    // .committee__code.
    expect((dialog.querySelector('[data-cdlg-code]') as HTMLElement).textContent).toBe('UNSC')
  })

  it('labels the block with whatever the card labelled it, never contradicting the text', () => {
    const dialog = openCard('UNSC')
    const block = dialog.querySelector('.cdlg__block--agenda') as HTMLElement
    const card = document.querySelector('[data-code="UNSC"]') as HTMLElement

    // The invariant that has to hold in both states: the dialog says the same
    // thing the card says. While agendas are pending the card leads on format,
    // so a hardcoded "Agenda" label here would sit above a format phrase.
    expect((block.querySelector('.cdlg__block-label') as HTMLElement).textContent).toBe(
      card.dataset['blockLabel'],
    )
    expect((dialog.querySelector('[data-cdlg-agenda]') as HTMLElement).textContent).toBe(
      card.dataset['blockText'],
    )
  })

  it('carries the pending agenda through to the dialog note', () => {
    const dialog = openCard('UNSC')
    expect((dialog.querySelector('[data-cdlg-note]') as HTMLElement).textContent).toBe(
      'Agenda to be announced.',
    )
  })
})

describe('the gallery, on editions.html', () => {
  const source = readFileSync(path.join(siteRoot, 'src/modules/gallery.js'), 'utf8')

  // The archive was a section on the landing page and is a page of its own now.
  // The outer beforeEach loads index.html, which no longer has any of this.
  beforeEach(() => {
    document.body.innerHTML = EDITIONS_BODY
  })

  it('is gated off while the photographs are not in the repository', () => {
    // Both halves have to hold together: the flag is off AND the files are absent.
    // When someone adds assets/past-galleries they must flip the flag, and this
    // test is what tells them.
    const published = /const PHOTOS_PUBLISHED = (true|false)/.exec(source)?.[1]
    const haveFiles = existsSync(path.join(siteRoot, 'assets/past-galleries'))
    expect(published, 'PHOTOS_PUBLISHED was renamed or removed').toBeDefined()
    expect(
      published === 'true',
      published === 'true'
        ? 'PHOTOS_PUBLISHED is on but assets/past-galleries is missing: nine broken plates ship'
        : 'assets/past-galleries exists now, so flip PHOTOS_PUBLISHED to true',
    ).toBe(haveFiles)
  })

  it('renders the marquee and a standing note, not an empty section', () => {
    initGallery(stubGsap())
    const root = document.querySelector('[data-gallery-root]') as HTMLElement
    expect(document.querySelector('[data-gallery-marquee-track]')?.textContent).toContain('IX')
    expect(root.textContent?.trim().length, 'the archive section renders empty').toBeGreaterThan(0)
  })

  it('builds no grid, no filters and no live region while it is gated off', () => {
    initGallery(stubGsap())
    expect(document.querySelectorAll('.gallery__item')).toHaveLength(0)
    expect(document.querySelectorAll('.gallery__filter')).toHaveLength(0)
    expect(document.querySelector('.gallery__status')).toBeNull()
  })

  it('leaves no undefined hole where a quote used to be spliced at 2, 7 and 11', () => {
    initGallery(stubGsap())
    expect(document.body.innerHTML).not.toContain('undefined')
    // QUOTES is empty, so nothing is spliced and ITEMS is the nine photos.
    expect(/const QUOTES = \[\s*\]/.test(source), 'QUOTES is no longer empty; retest the splice').toBe(
      true,
    )
    expect(source).toContain('if (quote && position <= out.length)')
  })

  it('writes real alt text, not the "PLACEHOLDER alt text" string it used to', () => {
    const alt = /alt: `([^`]*)`/.exec(source)?.[1]
    expect(alt).toBe('A moment from LRI Model UN edition ${roman}.')
    expect(alt).not.toMatch(/placeholder/i)
  })
})

describe('the organising committee section', () => {
  it('still parses and renders every tier', () => {
    initOc(stubGsap())
    expect(document.querySelectorAll('.oc-card').length).toBeGreaterThan(0)
  })

  it('names a real person in every card that is not an open post', () => {
    initOc(stubGsap())
    const cards = Array.from(document.querySelectorAll('.oc-card__name'))
    expect(cards.length).toBe(13)

    // "To be announced" used to be forbidden outright. A post can genuinely be
    // open now, so the rule is narrower: a placeholder is allowed only where the
    // markup says it is one. A card that is blank, or that says "To be
    // announced" without the class, is still a mistake.
    const open = cards.filter((el) => el.classList.contains('oc-card__name--open'))
    const named = cards.filter((el) => !el.classList.contains('oc-card__name--open'))

    for (const el of open) {
      expect(el.textContent?.trim()).toBe('To be announced')
    }

    const names = named.map((el) => el.textContent?.trim())
    for (const name of names) {
      expect(name, 'an OC card says "To be announced" without being marked open').not.toBe(
        'To be announced',
      )
      expect(name).toBeTruthy()
    }
    expect(new Set(names).size, 'duplicate name in the OC list').toBe(names.length)
  })

  it('renders no image at all for an open post, rather than one that 404s', () => {
    initOc(stubGsap())
    const openCards = Array.from(document.querySelectorAll('.oc-card')).filter((card) =>
      card.querySelector('.oc-card__name--open'),
    )
    expect(openCards.length, 'expected exactly one open post').toBe(1)

    for (const card of openCards) {
      expect(card.querySelector('img'), 'an open post requests a portrait that cannot exist').toBeNull()
      expect(card.querySelector('.media-plate')?.classList.contains('is-missing')).toBe(true)
    }
  })

  it('writes alt text that pairs the name with the role', () => {
    initOc(stubGsap())
    const alts = Array.from(document.querySelectorAll('.oc-card__media img')).map((img) =>
      img.getAttribute('alt'),
    )
    // Twelve portraits across thirteen cards: the open post has no image.
    expect(alts.length).toBe(12)
    for (const alt of alts) expect(alt).toMatch(/^.+, .+$/)
  })

  /**
   * The 12 portraits are not in the repository and will not be until 12 people
   * are photographed. That is tracked on the launch checklist in SETUP.md, not
   * here: a test that can only go green when someone takes a photograph is a
   * build gate nobody can unblock, and a permanently red suite is one people
   * learn to ignore.
   *
   * What IS this module's contract, and what these assert, is that the missing
   * state is handled rather than broken.
   */
  it('gives every portrait a monogram to fall back to', () => {
    initOc(stubGsap())
    const plates = Array.from(document.querySelectorAll('.oc-card__media'))
    expect(plates).toHaveLength(13)

    for (const plate of plates) {
      const fallback = plate.querySelector('.media-plate__fallback')
      expect(fallback, 'a portrait with no monogram renders as an empty box').not.toBeNull()
      // Initials for a person, a question mark for a post nobody holds yet.
      // Anything else is a typo that renders as a box with junk in it.
      expect(fallback?.textContent?.trim()).toMatch(/^([A-Z]{2,4}|\?)$/)
    }
  })

  it('marks a plate as missing when its portrait fails to load', () => {
    initOc(stubGsap())
    const plate = document.querySelector('.oc-card__media') as HTMLElement
    const img = plate.querySelector('img') as HTMLImageElement

    expect(plate.classList.contains('is-missing')).toBe(false)
    img.dispatchEvent(new Event('error'))
    expect(plate.classList.contains('is-missing')).toBe(true)
  })

  it('reports which portraits are still outstanding, without failing the build', () => {
    initOc(stubGsap())
    const srcs = Array.from(document.querySelectorAll('.oc-card__media img')).map(
      (img) => img.getAttribute('src') ?? '',
    )
    const missing = srcs.filter((src) => !existsSync(path.join(siteRoot, src.replace(/^[./]*/, ''))))

    if (missing.length > 0) {
      console.info(`[oc] ${missing.length} of ${srcs.length} portraits are not yet in assets/oc.`)
    }

    expect(srcs).toHaveLength(12)
  })
})
