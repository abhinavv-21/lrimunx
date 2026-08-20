import {
  AttendanceStatus,
  PriceTier,
  RegistrationStatus,
  RequestCategory,
  RequestStatus,
} from '@prisma/client'
import type { PrismaTransaction } from './prisma.js'
import { generateReference } from './registrations.js'
import { CONFERENCE_DAYS } from './conference.js'
import type { TierPrices } from './conference.js'

/**
 * Placeholder conference data for the restart button.
 *
 * The point is a hub with something in it: twenty applicants at four different
 * price tiers and three review states, delegates already sitting in committees,
 * a logistics queue with resolved and open work in it, and attendance filled in
 * across the three days. Enough that every screen has to render real numbers,
 * every filter has something to filter, and an empty state that should never
 * appear is visible immediately.
 *
 * Names are ordinary Nepali ones and schools are Kathmandu ones, because the
 * point of the rehearsal is that the secretariat recognises what it is looking
 * at. Committees are whatever is already in the database, which came from
 * apps/site/src/data/committees.js — the codes are never written down here, so
 * this cannot drift from the site the way a fourth copy of the list would.
 */

interface Person {
  fullName: string
  school: string
  grade: string
}

const PEOPLE: readonly Person[] = [
  { fullName: 'Aarav Shrestha', school: 'Little Angels School', grade: '11' },
  { fullName: 'Prakriti Basnet', school: 'Rato Bangala School', grade: '12' },
  { fullName: 'Sujan Maharjan', school: 'Budhanilkantha School', grade: '11' },
  { fullName: 'Nisha Gurung', school: "St. Xavier's School", grade: '12' },
  { fullName: 'Bibek Adhikari', school: 'Lalitpur Reliance International', grade: '10' },
  { fullName: 'Sneha Karki', school: 'Kathmandu World School', grade: '11' },
  { fullName: 'Rohan Thapa', school: 'GEMS School', grade: '12' },
  { fullName: 'Anushka Rai', school: 'Trinity International College', grade: '11' },
  { fullName: 'Nabin Poudel', school: 'Lalitpur Reliance International', grade: '12' },
  { fullName: 'Sabina Lama', school: 'Ullens School', grade: '10' },
  { fullName: 'Kiran Bhattarai', school: 'Nepal Police School', grade: '11' },
  { fullName: 'Manisha Tamang', school: 'Rato Bangala School', grade: '12' },
  { fullName: 'Deepak Chaudhary', school: 'Little Angels School', grade: '11' },
  { fullName: 'Ritika Joshi', school: 'Lalitpur Reliance International', grade: '10' },
  { fullName: 'Suman Khadka', school: 'Kathmandu World School', grade: '12' },
  { fullName: 'Aayush Sapkota', school: 'Budhanilkantha School', grade: '11' },
  { fullName: 'Pooja Neupane', school: "St. Mary's School", grade: '12' },
  { fullName: 'Bikash Magar', school: 'GEMS School', grade: '11' },
  { fullName: 'Srijana Dahal', school: 'Ullens School', grade: '12' },
  { fullName: 'Ashish Bhandari', school: 'Lalitpur Reliance International', grade: '11' },
]

// LRI's own students are the ones who get the INTERNAL rate, so the school on
// the row and the tier on the row have to agree. This is the rule the finance
// screen is going to be read against, and placeholder data that broke it would
// make a correct summary look wrong.
const INTERNAL_SCHOOL = 'Lalitpur Reliance International'

const LOGISTICS_SEEDS: ReadonlyArray<{
  title: string
  category: RequestCategory
  description: string
  status: RequestStatus
  ageMinutes: number
  day: number | null
}> = [
  {
    title: 'Two placards missing from the front row',
    category: RequestCategory.PLACARD,
    description: 'Brazil and Egypt placards are not in the room. Delegates are here.',
    status: RequestStatus.OPEN,
    ageMinutes: 12,
    day: 1,
  },
  {
    title: 'Projector will not hold the HDMI signal',
    category: RequestCategory.LOGISTICS,
    description: 'Cuts out every few minutes during the opening speeches. Needs a different cable.',
    status: RequestStatus.IN_PROGRESS,
    ageMinutes: 95,
    day: 1,
  },
  {
    title: 'Refill the chair table with pads and pens',
    category: RequestCategory.STATIONERY,
    description: 'Down to four pads for the afternoon session.',
    status: RequestStatus.RESOLVED,
    ageMinutes: 300,
    day: 1,
  },
  {
    title: 'Certificates for the closing ceremony',
    category: RequestCategory.AWARDS,
    description: 'Names to be printed once the awards panel confirms them on day 3.',
    status: RequestStatus.OPEN,
    ageMinutes: 1_440,
    day: 3,
  },
  {
    title: 'Second microphone for the moderated caucus',
    category: RequestCategory.LOGISTICS,
    description: 'One mic between forty delegates is slowing the speakers list down.',
    status: RequestStatus.OPEN,
    ageMinutes: 40,
    day: 2,
  },
  {
    title: 'Water for the delegates in the hall',
    category: RequestCategory.LOGISTICS,
    description: 'Jugs on the back table are empty and it is warm in there.',
    status: RequestStatus.RESOLVED,
    ageMinutes: 220,
    day: 2,
  },
]

function slugEmail(fullName: string, index: number): string {
  const local = fullName.toLowerCase().replace(/[^a-z]+/g, '.')
  return `${local}.${index}@placeholder.lrimunx.test`
}

// Deterministic rather than random: a restart that produces the same books
// twice is one the secretariat can compare against a screenshot from an hour
// ago, and a random one is a bug report nobody can reproduce.
function tierFor(person: Person, index: number): PriceTier {
  if (person.school === INTERNAL_SCHOOL) return PriceTier.INTERNAL
  if (index % 7 === 3) return PriceTier.ALUMNI
  if (index % 7 === 5) return PriceTier.DISCOUNT
  return PriceTier.BASE
}

function statusFor(index: number): RegistrationStatus {
  if (index % 5 === 4) return RegistrationStatus.REJECTED
  if (index % 5 === 3) return RegistrationStatus.PENDING
  return RegistrationStatus.APPROVED
}

export interface PlaceholderCounts {
  registrations: number
  delegates: number
  assignments: number
  logisticsRequests: number
  attendance: number
}

export interface PlaceholderCommittee {
  id: string
  code: string
  totalSeats: number
  countries: string[]
}

/**
 * Writes the placeholder conference. Expects to be handed committees that are
 * already in the database and an empty set of everything else — the caller
 * wipes first.
 *
 * Twenty registrations and everything downstream of them, so the whole thing is
 * a few hundred rows and no query in here is unbounded.
 */
export async function seedPlaceholders(
  tx: PrismaTransaction,
  committees: PlaceholderCommittee[],
  actorId: string,
  prices: TierPrices,
  now: Date = new Date(),
): Promise<PlaceholderCounts> {
  if (committees.length === 0) {
    throw new Error('No committees to seat delegates in')
  }

  const counts: PlaceholderCounts = {
    registrations: 0,
    delegates: 0,
    assignments: 0,
    logisticsRequests: 0,
    attendance: 0,
  }

  // Countries are handed out from each committee's matrix where it has one and
  // fall back to a plain label where it does not, which is the same rule
  // applyAssignment follows. A committee with two seats gets two delegates.
  const seats: Array<{ committeeId: string; country: string }> = []
  for (const committee of committees) {
    const available = committee.countries.length > 0 ? committee.countries : null
    const cap = Math.min(committee.totalSeats, available?.length ?? committee.totalSeats)

    for (let i = 0; i < cap; i++) {
      seats.push({
        committeeId: committee.id,
        country: available ? available[i]! : `${committee.code} Seat ${i + 1}`,
      })
    }
  }

  let seatIndex = 0

  for (const [index, person] of PEOPLE.entries()) {
    const status = statusFor(index)
    const tier = tierFor(person, index)
    const email = slugEmail(person.fullName, index)

    // Rejected applicants have no money against them; the review desk never got
    // as far as recording one. Everyone else pays the tier rate except one, who
    // is short by 500 so the shortfall column on the finance screen has
    // something in it.
    const paid = status === RegistrationStatus.REJECTED ? null : prices[tier] - (index === 6 ? 500 : 0)

    const preferences = [
      committees[index % committees.length]!.code,
      committees[(index + 3) % committees.length]!.code,
    ]

    const delegate =
      status === RegistrationStatus.APPROVED
        ? await tx.delegate.create({
            data: {
              fullName: person.fullName,
              email,
              phone: `+9779${(800_000_000 + index * 111_111).toString().slice(0, 9)}`,
              schoolName: person.school,
              grade: person.grade,
              committeePreference: preferences[0]!,
              committeePreference2: preferences[1]!,
              munsAttended: index % 6,
              awardsWon: index % 3 === 0 ? 1 : 0,
            },
            select: { id: true },
          })
        : null

    if (delegate) counts.delegates += 1

    await tx.registration.create({
      data: {
        reference: generateReference(),
        fullName: person.fullName,
        email,
        phone: `+9779${(800_000_000 + index * 111_111).toString().slice(0, 9)}`,
        schoolName: person.school,
        grade: person.grade,
        committeePreference: preferences[0]!,
        committeePreference2: preferences[1]!,
        munsAttended: index % 6,
        awardsWon: index % 3 === 0 ? 1 : 0,
        referralCode: index % 4 === 0 ? 'RIDGE-MUNSOC' : null,
        status,
        priceTier: status === RegistrationStatus.REJECTED ? null : tier,
        amountPaid: paid,
        ...(status === RegistrationStatus.REJECTED
          ? { rejectionReason: 'Applied after the school block was closed.' }
          : {}),
        ...(status === RegistrationStatus.PENDING
          ? {}
          : { reviewedById: actorId, reviewedAt: now }),
        ...(delegate ? { delegateId: delegate.id } : {}),
      },
    })
    counts.registrations += 1

    if (delegate && seatIndex < seats.length) {
      const seat = seats[seatIndex]!
      seatIndex += 1

      await tx.assignment.create({
        data: {
          delegateId: delegate.id,
          committeeId: seat.committeeId,
          country: seat.country,
          assignedById: actorId,
        },
      })
      counts.assignments += 1

      // Attendance across the three days, thinning out the way it really does:
      // everyone on day 1, a couple missing on day 2, more on day 3.
      for (const { day } of CONFERENCE_DAYS) {
        const present = day === 1 || (day === 2 ? index % 6 !== 0 : index % 4 !== 0)
        await tx.delegateAttendance.create({
          data: {
            delegateId: delegate.id,
            day,
            status: present ? AttendanceStatus.CHECKED_IN : AttendanceStatus.ABSENT,
          },
        })
        counts.attendance += 1
      }

      await tx.delegate.update({
        where: { id: delegate.id },
        data: { attendanceStatus: AttendanceStatus.CHECKED_IN },
      })
    }
  }

  for (const [index, seed] of LOGISTICS_SEEDS.entries()) {
    const createdAt = new Date(now.getTime() - seed.ageMinutes * 60_000)

    await tx.logisticsReq.create({
      data: {
        title: seed.title,
        category: seed.category,
        description: seed.description,
        status: seed.status,
        day: seed.day,
        committeeId: committees[index % committees.length]!.id,
        createdById: actorId,
        createdAt,
        ...(seed.status === RequestStatus.RESOLVED ? { resolvedById: actorId } : {}),
      },
    })
    counts.logisticsRequests += 1
  }

  return counts
}
