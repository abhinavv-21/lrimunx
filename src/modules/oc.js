/**
 * oc.js — organizing committee roster.
 *
 * The roster is rendered from the data block below so the school edits ONE
 * list rather than fifteen blocks of near-identical markup. Everything else on
 * the page that matters for SEO or no-JS is authored directly in index.html.
 *
 * ─── PLACEHOLDER DATA ─────────────────────────────────────────────────────
 * Every `name` below is a placeholder. Role titles are structural (they are the
 * conference's own org chart, not invented people) and can stay. Replace each
 * `name`, drop the headshot into /assets/oc/ using the `photo` filename, and
 * add a `social` object where a delegate has agreed to have one listed.
 *
 *   { name: 'Real Name', role: 'Secretary-General',
 *     photo: 'secretary-general.jpg', mono: 'SG',
 *     detail: 'One line of context.',
 *     social: { label: 'Instagram', href: 'https://instagram.com/handle' } }
 *
 * Until a photo exists, the card falls back to a gold monogram plate — an
 * intentional placeholder rather than a broken image.
 * ──────────────────────────────────────────────────────────────────────────
 */

const TIERS = [
  {
    id: 'advisors',
    title: 'Advisors',
    caption: 'Faculty oversight',
    members: [
      {
        name: 'To be announced',
        role: 'Chief Advisor',
        photo: 'chief-advisor.jpg',
        mono: 'CA',
        detail: 'Patron of the conference and final authority on school matters.',
        social: null,
      },
      {
        name: 'To be announced',
        role: 'Faculty Advisor',
        photo: 'advisor-01.jpg',
        mono: 'FA',
        detail: 'Academic oversight of committee content and conduct.',
        social: null,
      },
      {
        name: 'To be announced',
        role: 'Faculty Advisor',
        photo: 'advisor-02.jpg',
        mono: 'FA',
        detail: 'Institutional liaison and delegate welfare.',
        social: null,
      },
    ],
  },
  {
    id: 'upper',
    title: 'Upper Secretariat',
    caption: 'Conference leadership',
    members: [
      {
        name: 'To be announced',
        role: 'Secretary-General',
        photo: 'secretary-general.jpg',
        mono: 'SG',
        detail: 'Final authority on the conference agenda and its execution.',
        social: null,
      },
      {
        name: 'To be announced',
        role: 'Deputy Secretary-General',
        photo: 'deputy-secretary-general.jpg',
        mono: 'DSG',
        detail: 'Deputises across committees and chairs the secretariat.',
        social: null,
      },
      {
        name: 'To be announced',
        role: 'Director-General',
        photo: 'director-general.jpg',
        mono: 'DG',
        detail: 'Operations, venue and the running order of all three days.',
        social: null,
      },
      {
        name: 'To be announced',
        role: "Chargé d'Affaires",
        photo: 'charge-daffaires.jpg',
        mono: 'CDA',
        detail: 'School delegations, allocations and external correspondence.',
        social: null,
      },
      {
        name: 'To be announced',
        role: 'Head of Committee Affairs',
        photo: 'head-committee-affairs.jpg',
        mono: 'HCA',
        detail: 'Chair training, rules of procedure and study guides.',
        social: null,
      },
    ],
  },
  {
    id: 'under',
    title: 'Under Secretariat',
    caption: 'Departments',
    members: [
      { name: 'To be announced', role: 'USG · Delegate Affairs', photo: 'usg-delegate-affairs.jpg', mono: 'DA', social: null },
      { name: 'To be announced', role: 'USG · Logistics', photo: 'usg-logistics.jpg', mono: 'LOG', social: null },
      { name: 'To be announced', role: 'USG · Finance', photo: 'usg-finance.jpg', mono: 'FIN', social: null },
      { name: 'To be announced', role: 'USG · Press & Media', photo: 'usg-press.jpg', mono: 'PR', social: null },
      { name: 'To be announced', role: 'USG · Design', photo: 'usg-design.jpg', mono: 'DSN', social: null },
      { name: 'To be announced', role: 'USG · Outreach', photo: 'usg-outreach.jpg', mono: 'OUT', social: null },
      { name: 'To be announced', role: 'USG · Technology', photo: 'usg-technology.jpg', mono: 'TECH', social: null },
      { name: 'To be announced', role: 'USG · Hospitality', photo: 'usg-hospitality.jpg', mono: 'HOS', social: null },
    ],
  },
]

export function initOc({ gsap, ScrollTrigger, reduced }) {
  const root = document.querySelector('[data-oc-root]')
  if (!root) return

  const fragment = document.createDocumentFragment()

  TIERS.forEach((tier, tierIndex) => {
    const section = document.createElement('div')
    section.className = `oc__tier oc__tier--${tier.id}`

    const head = document.createElement('div')
    head.className = 'oc__tier-head'

    const titleId = `oc-tier-${tier.id}`
    head.innerHTML = `
      <h3 class="oc__tier-title" id="${titleId}">${tier.title}</h3>
      <p class="label oc__tier-caption">${tier.caption}</p>
      <p class="label oc__tier-count" aria-hidden="true">${String(tier.members.length).padStart(2, '0')}</p>
    `

    const grid = document.createElement('ul')
    grid.className = 'oc__grid'
    grid.setAttribute('aria-labelledby', titleId)

    tier.members.forEach((member) => grid.append(renderCard(member, tier)))

    section.append(head, grid)
    fragment.append(section)

    // Reveal per tier so the three tiers arrive as three distinct beats rather
    // than one 15-card wave.
    section.dataset.ocTier = String(tierIndex)
  })

  root.append(fragment)

  if (reduced) return

  root.querySelectorAll('[data-oc-tier]').forEach((tier) => {
    const cards = tier.querySelectorAll('.oc-card')
    gsap.set(cards, { opacity: 0, y: 26 })

    ScrollTrigger.create({
      trigger: tier,
      // Fires at the fold, not a fifth of the way up the screen, so a card is
      // never sitting visibly empty before it animates. Same start / travel /
      // curve as the shared batch in main.js — one reveal language, not five.
      start: 'top 94%',
      once: true,
      onEnter: () =>
        gsap.to(cards, {
          opacity: 1,
          y: 0,
          duration: 1.15,
          ease: 'expo.out',
          stagger: 0.06,
          clearProps: 'transform',
        }),
    })
  })
}

function renderCard(member, tier) {
  const li = document.createElement('li')
  li.className = 'oc-card'

  const detail =
    member.detail && tier.id !== 'under'
      ? `<p class="oc-card__detail">${member.detail}</p>`
      : ''

  const social = member.social
    ? `<a class="oc-card__social" href="${member.social.href}" target="_blank" rel="noopener noreferrer">
         <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
           <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/>
           <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>
           <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor"/>
         </svg>
         <span>${member.social.label}<span class="u-visually-hidden"> — ${member.name}, opens in a new tab</span></span>
       </a>`
    : ''

  li.innerHTML = `
    <div class="oc-card__media media-plate">
      <img
        src="${import.meta.env.BASE_URL}assets/oc/${member.photo}"
        alt="${member.name} — ${member.role}"
        loading="lazy"
        decoding="async"
        width="400"
        height="500"
      />
      <span class="media-plate__fallback" aria-hidden="true">${member.mono}</span>
    </div>
    <p class="oc-card__name">${member.name}</p>
    <p class="oc-card__role">${member.role}</p>
    ${detail}
    ${social}
  `

  // TODO: alt text above is generated from placeholder names. Once real names
  // and photographs land, review each alt string for accuracy.
  const img = li.querySelector('img')
  img.addEventListener('error', () => img.closest('.media-plate')?.classList.add('is-missing'), {
    once: true,
  })

  return li
}
