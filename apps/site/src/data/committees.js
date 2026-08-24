/**
 * The committee list. This file is the source of truth.
 *
 * The cards on the landing page, the two preference dropdowns on the
 * registration form, and the seat counts seeded into the database all read from
 * here. `prisma/seed.ts` keeps a copy of code/name/seats because it cannot
 * import across the workspace boundary; `npm run check:committees` fails if the
 * two ever disagree.
 *
 * Adding a committee: add an entry, drop an icon at assets/icons/<icon>.svg,
 * and mirror code/name/seats into prisma/seed.ts.
 *
 * seats     The hard cap. The API refuses an allocation past it
 *           (delegates.routes.ts), so never advertise a number the hub will
 *           not honour.
 * kind      What sort of room it is, shown next to the code. Not derived from
 *           seatNoun: ICJ and IP both use 'places' and are not the same kind of
 *           room. Anything other than 'Country delegation' also gets a gold top
 *           edge on the card, so the difference survives skimming.
 * seatNoun  'seats' for country delegations, 'places' where a delegate does not
 *           hold a country (ICJ, IP).
 * meta      The rest of the line under the agenda, joined with a middot. Kept
 *           per committee so a press corps is not described as though it passed
 *           resolutions.
 * agenda    null renders "To be announced." Replace with the motion text.
 *
 * Seat counts are provisional. Thirty is the house size; the Security Council
 * is deliberately small, the press corps sits at twenty-four and the Federal
 * Parliament at sixty because a legislature with thirty members is not one.
 *
 * They are advertised as provisional on the committees section, so they can
 * move before registration opens. What cannot move quietly is the seed: the API
 * enforces the seeded number at allocation time, so `npm run check:committees`
 * fails if this file and prisma/seed.ts ever disagree.
 */
export const COMMITTEES = [
  {
    code: 'UNSC',
    kind: 'Country delegation',
    name: 'United Nations Security Council',
    icon: 'unsc',
    level: 'Advanced',
    seats: 15,
    seatNoun: 'seats',
    meta: ['Double-delegate', 'Position paper required'],
    blurb:
      'Convenes on international peace and security, with the power to impose measures the rest of the UN can only recommend.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
  {
    code: 'ICJ',
    kind: 'Court',
    name: 'International Court of Justice',
    icon: 'icj',
    level: 'Intermediate',
    seats: 30,
    seatNoun: 'places',
    meta: ['Advocates and justices', 'Memorial required'],
    blurb:
      'The principal judicial organ of the UN. Advocates argue a case on the record and the bench rules on it, rather than negotiating a resolution.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
  {
    code: 'ECOSOC',
    kind: 'Country delegation',
    name: 'Economic and Social Council',
    icon: 'ecosoc',
    level: 'Beginner',
    seats: 30,
    seatNoun: 'seats',
    meta: ['Single-delegate', 'First-time delegates welcome'],
    blurb:
      'The widest brief in the conference: the economic, social and environmental work the rest of the UN system leans on.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
  {
    code: 'DISEC',
    kind: 'Country delegation',
    name: 'Disarmament and International Security Committee',
    icon: 'disec',
    level: 'Advanced',
    seats: 30,
    seatNoun: 'seats',
    meta: ['Single-delegate', 'Position paper required'],
    blurb:
      'The First Committee of the General Assembly: disarmament, and the threats states argue are worth arming against. One of the two rooms that wants a position paper before you arrive.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
  {
    code: 'UNODC',
    kind: 'Country delegation',
    name: 'United Nations Office on Drugs and Crime',
    icon: 'unodc',
    level: 'Beginner',
    seats: 30,
    seatNoun: 'seats',
    meta: ['Single-delegate', 'First-time delegates welcome'],
    blurb:
      'Trafficking, organised crime, corruption and terrorism, and the treaties that are meant to bind states to act on them.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
  {
    code: 'UNHRC',
    kind: 'Country delegation',
    name: 'United Nations Human Rights Council',
    icon: 'unhrc',
    level: 'Intermediate',
    seats: 30,
    seatNoun: 'seats',
    meta: ['Single-delegate', 'Position paper required'],
    blurb:
      'Violations get named here, and the state named gets to answer for them on the record.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
  {
    code: 'UNHCR',
    kind: 'Country delegation',
    name: 'United Nations High Commissioner for Refugees',
    icon: 'unhcr',
    level: 'Intermediate',
    seats: 30,
    seatNoun: 'seats',
    meta: ['Single-delegate', 'Position paper required'],
    blurb:
      'Asylum, statelessness and resettlement, and what states owe the people who have had to leave.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
  {
    code: 'UNWOMEN',
    kind: 'Country delegation',
    name: 'UN Women',
    icon: 'unwomen',
    level: 'Beginner',
    seats: 30,
    seatNoun: 'seats',
    meta: ['Single-delegate', 'First-time delegates welcome'],
    blurb:
      'Political representation, economic rights, and violence against women. A reasonable first committee if you have never sat in one.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
  {
    code: 'FPN',
    kind: 'Parliament',
    name: 'Federal Parliament of Nepal',
    icon: 'fpn',
    level: 'Beginner',
    seats: 60,
    seatNoun: 'seats',
    meta: ['Portfolio powers', 'No country delegations'],
    blurb:
      'The federal legislature of Nepal, simulated, and the largest room at the conference. Members hold real political portfolios and argue national policy under parliamentary procedure.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
  {
    code: 'IP',
    kind: 'Press corps',
    name: 'International Press',
    icon: 'ip',
    level: 'Beginner',
    seats: 24,
    seatNoun: 'places',
    meta: ['Reporters and photographers', 'Portfolio by outlet'],
    blurb:
      'The conference newsroom. Reporters and photographers cover every committee on deadline, and what they file is published while the conference runs.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
  {
    code: 'ECOFIN',
    kind: 'Country delegation',
    name: 'Economic and Financial Committee',
    icon: 'ecofin',
    level: 'Beginner',
    seats: 30,
    seatNoun: 'seats',
    meta: ['Single-delegate', 'First-time delegates welcome'],
    blurb:
      'The Second Committee of the General Assembly: trade, debt and development finance, which is the money underneath what every other room is arguing about.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
  {
    code: 'SOCHUM',
    kind: 'Country delegation',
    name: 'Social, Humanitarian and Cultural Committee',
    icon: 'sochum',
    level: 'Beginner',
    seats: 30,
    seatNoun: 'seats',
    meta: ['Single-delegate', 'First-time delegates welcome'],
    blurb:
      'The Third Committee. Refugees, minorities and freedom of expression, argued at the scale of the whole General Assembly.',
    agenda: null,
    chair: null,
    viceChair: null,
  },
]

/** "15 seats · Double-delegate · Position paper required" */
export function metaLine(committee) {
  return [`${committee.seats} ${committee.seatNoun}`, ...committee.meta].join(' · ')
}

/** What the registration form submits, e.g. "UN Women (UNWOMEN)". */
export function preferenceValue(committee) {
  return `${committee.name} (${committee.code})`
}
