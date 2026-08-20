const TIERS = [
  {
    id: 'advisors',
    title: 'Advisors',
    caption: 'Faculty oversight',
    members: [
      {
        name: 'Subrat Lamichhane',
        role: 'Chief Advisor',
        photo: 'subrat-lamichhane.jpg',
        mono: 'SL',
        detail: 'Patron of the conference and final authority on school matters.',
        social: null,
      },
      {
        name: 'Siddub Sharma Bidari',
        role: 'Senior Advisor',
        photo: 'siddub-sharma-bidari.jpg',
        mono: 'SB',
        detail: 'Academic oversight of committee content and conduct.',
        social: null,
      },
      {
        name: 'Mhigshang Lama Yolmo',
        role: 'Advisor',
        photo: 'mhigshang-lama-yolmo.jpg',
        mono: 'MY',
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
        name: 'Aaradhy Raj Pant',
        role: 'Secretary-General',
        photo: 'aaradhy-raj-pant.jpg',
        mono: 'AP',
        detail: 'Final authority on the conference agenda and its execution.',
        social: null,
      },
      {
        name: 'Abhinav GC',
        role: 'Deputy Secretary-General',
        photo: 'abhinav-gc.jpg',
        mono: 'AG',
        detail: 'Deputises across committees and chairs the secretariat.',
        social: null,
      },
      {
        name: 'Bidushi Sharma',
        role: 'Director-General',
        photo: 'bidushi-sharma.jpg',
        mono: 'BS',
        detail: 'Operations, venue and the running order of the conference.',
        social: null,
      },
    ],
  },
  {
    id: 'under',
    title: 'Under Secretariat',
    caption: 'Departments',
    members: [
      { name: 'Aditya Joshi', role: 'Head of Conference Management', photo: 'aditya-joshi.jpg', mono: 'AJ', social: null },
      { name: 'Sparsh Sharma', role: 'Head of Delegate and Dais Affairs', photo: 'sparsh-sharma.jpg', mono: 'SS', social: null },
      { name: 'Asia Ramdam', role: 'Media Team', photo: 'asia-ramdam.jpg', mono: 'AR', social: null },
      { name: 'Abhigya Shrestha', role: 'Media Team', photo: 'abhigya-shrestha.jpg', mono: 'AS', social: null },
      { name: 'Stuti Gautam', role: 'Media Team', photo: 'stuti-gautam.jpg', mono: 'SG', social: null },
      { name: 'Krystal Gurung', role: 'Head of Outreach', photo: 'krystal-gurung.jpg', mono: 'KG', social: null },
      { name: 'Desna KC', role: 'Head of Logistics', photo: 'desna-kc.jpg', mono: 'DK', social: null },
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

    section.dataset.ocTier = String(tierIndex)
  })

  root.append(fragment)

  if (reduced) return

  root.querySelectorAll('[data-oc-tier]').forEach((tier) => {
    const cards = tier.querySelectorAll('.oc-card')
    gsap.set(cards, { opacity: 0, y: 26 })

    ScrollTrigger.create({
      trigger: tier,
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
         <span>${member.social.label}<span class="u-visually-hidden">, ${member.name}, opens in a new tab</span></span>
       </a>`
    : ''

  li.innerHTML = `
    <div class="oc-card__media media-plate">
      <img
        src="${import.meta.env.BASE_URL}assets/oc/${member.photo}"
        alt="${member.name}, ${member.role}"
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

  const img = li.querySelector('img')
  img.addEventListener('error', () => img.closest('.media-plate')?.classList.add('is-missing'), {
    once: true,
  })

  return li
}
