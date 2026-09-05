import { COMMITTEES, metaLine } from '../data/committees.js'

const LEVEL_CLASS = {
  Advanced: 'tag--advanced',
  Intermediate: 'tag--intermediate',
  Beginner: 'tag--beginner',
}

const STANDARD_KIND = 'Country delegation'

const ARROW = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" />
</svg>`

/**
 * Renders the committee grid from src/data/committees.js.
 *
 * Emits the markup committees.css already targets, and committee-dialog.js
 * reads a card back out of the DOM, so neither needed changing when the cards
 * moved out of index.html.
 *
 * Runs before initCommittees, which animates the cards it finds.
 */
export function renderCommitteeCards() {
  const grid = document.querySelector('[data-committees-grid]')
  if (!grid) return

  grid.innerHTML = ''
  COMMITTEES.forEach((committee, index) => grid.append(card(committee, index)))

  // The eyebrow counts the list rather than hardcoding a number that goes stale
  // the moment a committee is added.
  const eyebrow = document.querySelector('[data-committees-eyebrow]')
  if (eyebrow) eyebrow.textContent = `${spell(COMMITTEES.length)} committees`
}

function card(committee, index) {
  const li = document.createElement('li')
  li.className = 'committee'
  li.dataset.committee = ''
  li.dataset.code = committee.code
  li.dataset.chair = committee.chair ?? 'To be announced'
  li.dataset.viceChair = committee.viceChair ?? 'To be announced'

  const offPattern = committee.kind !== STANDARD_KIND

  // The card used to hide this behind a panel that slid up on hover. It now
  // rides on the element as data and only the dialog renders it, so the card
  // is what it looks like and nothing is stacked on top of the seat count.
  // While an agenda is pending the block leads on format instead: twelve rooms
  // all reading "To be announced" is an empty answer, and format and size are
  // the real thing a delegate is choosing between.
  const pending = !committee.agenda
  li.dataset.blockLabel = pending ? 'Format' : 'Agenda'
  li.dataset.blockText = pending ? committee.meta.join(', ') : committee.agenda
  li.dataset.blockNote = pending ? 'Agenda to be announced.' : metaLine(committee)

  li.innerHTML = `
    <article class="committee__card${offPattern ? ' committee__card--offpattern' : ''}">
      <span class="numeral committee__index" aria-hidden="true">${pad(index + 1)}</span>
      <img
        class="committee__icon"
        src="${import.meta.env.BASE_URL}assets/icons/${committee.icon}.svg"
        alt=""
        width="28"
        height="28"
        loading="lazy"
        decoding="async"
      />
      <h3 class="committee__name">${escape(committee.name)}</h3>
      <p class="committee__abbr">
        <span class="committee__code">${escape(committee.code)}</span>
        <span class="committee__kind">${escape(committee.kind)}</span>
      </p>
      <p class="committee__blurb">${escape(committee.blurb)}</p>
      <footer class="committee__foot">
        <p class="committee__seats">
          <span class="committee__seats-figure">${committee.seats}</span>
          <span class="committee__seats-noun">${escape(committee.seatNoun)}</span>
        </p>
        <span class="tag ${LEVEL_CLASS[committee.level] ?? 'tag--intermediate'}">${escape(committee.level)}</span>
        <button class="committee__toggle" type="button" aria-haspopup="dialog" data-committee-open>
          <span>Details</span>
          ${ARROW}
        </button>
      </footer>
    </article>
  `

  // Hide rather than remove, so a missing icon does not pull the whole card up
  // by 1.75rem and break the grid's rhythm.
  const icon = li.querySelector('.committee__icon')
  icon?.addEventListener('error', () => icon.classList.add('is-missing'), { once: true })

  return li
}

const pad = (n) => String(n).padStart(2, '0')

const NUMBER_WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
]

/** "Fourteen committees" reads better than "14 committees" in a section eyebrow. */
function spell(n) {
  return NUMBER_WORDS[n] ?? String(n)
}

function escape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
