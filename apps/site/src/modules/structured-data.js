import { COMMITTEES } from '../data/committees.js'

/**
 * The JSON-LD block on the landing page.
 *
 * Written by JavaScript rather than typed into index.html for one reason: the
 * seat total and the committee count are also on the page as prose, and a
 * hand-written block is a second copy that goes stale the first time a
 * committee is added. scripts/check-committees.mjs already guards the two
 * figures in the About section; this reads the list directly, so there is
 * nothing left to guard.
 *
 * Two objects, in one @graph so they can reference each other:
 *
 *   Event         the conference itself, as an EducationEvent, with its dates,
 *                 its venue and the registration page as an Offer.
 *   Organization  who runs it, so the mark and the Instagram account are
 *                 attached to a named entity rather than floating.
 *
 * A crawler that ignores all of this loses nothing: everything below is also
 * readable on the page in words.
 */

const ORG_ID = '#organisation'
const EVENT_ID = '#conference'

const PLACE = {
  '@type': 'Place',
  name: "Learning Realm Int'l School",
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Kalanki',
    addressLocality: 'Kathmandu',
    addressCountry: 'NP',
  },
}

export function initStructuredData() {
  // Absolute URLs are required here, and the page does not know its own domain
  // until it is being served. location.origin is that answer, and it is correct
  // on the preview deploy, on the final domain and on localhost alike.
  const origin = window.location.origin

  const seats = COMMITTEES.reduce((total, committee) => total + committee.seats, 0)

  const graph = [
    {
      '@type': 'Organization',
      '@id': origin + ORG_ID,
      name: 'LRI Model UN X',
      alternateName: 'LRI Model United Nations',
      url: origin + '/',
      logo: origin + '/assets/lri-mun-logo.png',
      email: 'lrimodelun@gmail.com',
      sameAs: ['https://www.instagram.com/lrimunx/'],
      parentOrganization: {
        '@type': 'EducationalOrganization',
        name: "Learning Realm Int'l School",
        url: 'https://www.lrischool.edu.np/',
      },
    },
    {
      '@type': 'EducationEvent',
      '@id': origin + EVENT_ID,
      name: 'LRI Model UN X',
      description:
        'The tenth edition of LRI School’s Model United Nations conference. ' +
        `${COMMITTEES.length} committees and ${seats} seats over three days at LRI School, Kalanki, Kathmandu.`,
      // No time zone offset on purpose: this is an all-day, multi-day event and
      // a bare date is what schema.org asks for in that case.
      startDate: '2026-11-20',
      endDate: '2026-11-22',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      inLanguage: 'en',
      image: origin + '/assets/og-image.png',
      url: origin + '/',
      location: PLACE,
      organizer: { '@id': origin + ORG_ID },
      offers: {
        '@type': 'Offer',
        name: 'Delegate registration',
        url: origin + '/register',
        availability: 'https://schema.org/InStock',
        // The delegate fee is not set yet (TODO.md). A price of 0 would be a
        // lie, so the Offer says where to register and stays quiet about cost.
        category: 'Delegate',
      },
    },
  ]

  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
  document.head.append(script)
}
