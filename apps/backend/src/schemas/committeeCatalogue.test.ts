/**
 * The committee catalogue lives in apps/site/src/data/committees.js. What the
 * registration form submits for committeePreference has to survive the schema
 * on this side, and the seat counts the site advertises have to be values the
 * hub would accept for a committee. Those two contracts cross the workspace
 * boundary, so nothing else checks them.
 *
 * check-committees.mjs compares the site list to prisma/seed.ts. This compares
 * the site list to the API that receives it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error -- plain ESM from the site workspace, no types by design
import { COMMITTEES, metaLine, preferenceValue } from '../../../site/src/data/committees.js'
// @ts-expect-error -- plain ESM from the site workspace, no types by design
import { COMMITTEES as LISTBOX_OPTIONS } from '../../../site/src/modules/committee-select.js'
import { createCommitteeSchema, publicRegistrationSchema } from './index.js'

interface Committee {
  code: string
  name: string
  icon: string
  level: string
  seats: number
  seatNoun: string
  meta: string[]
  blurb: string
  agenda: string | null
}

const catalogue = COMMITTEES as Committee[]
const options = LISTBOX_OPTIONS as Array<{ code: string; name: string; value: string }>

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')
const siteRoot = path.resolve(repoRoot, 'apps/site')

/** A registration payload that passes on everything except the field under test. */
function submission(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    fullName: 'Prakriti Basnet',
    email: 'prakriti@ridge.edu.np',
    phone: '+977 9812345678',
    schoolName: 'Ridge International School',
    grade: '11',
    munsAttended: '4',
    awardsWon: '1',
    ...fields,
  }
}

describe('the committee catalogue', () => {
  it('has the twelve committees the site and the seed agree on', () => {
    expect(catalogue).toHaveLength(12)
    // This is the order the cards are numbered in, so it is a decision rather
    // than an accident: the two advanced rooms open the list together.
    expect(catalogue.map((c) => c.code)).toEqual([
      'UNSC',
      'DISEC',
      'ICJ',
      'INTERPOL',
      'UNODC',
      'UNHRC',
      'UNHCR',
      'UNWOMEN',
      'FPN',
      'IP',
      'UNOOSA',
      'HCC',
    ])
  })

  it('has no duplicate code, name or icon', () => {
    for (const key of ['code', 'name', 'icon'] as const) {
      const values = catalogue.map((c) => c[key])
      expect(new Set(values).size, `duplicate ${key} in the catalogue`).toBe(values.length)
    }
  })

  it('seats thirty-five in every room except the three that are deliberately not', () => {
    // Thirty-five is the house size. The Security Council is small because it is
    // fifteen members in real life, the press corps is sized to the number of
    // outlets it runs, and a Federal Parliament the size of an ordinary
    // committee is not a parliament.
    const deliberate: Record<string, number> = { UNSC: 15, IP: 22, FPN: 60 }

    for (const committee of catalogue) {
      expect(committee.seats, committee.code).toBe(deliberate[committee.code] ?? 35)
    }
  })

  it('marks the level of every room, and only DISEC and UNSC as advanced', () => {
    const byLevel = (level: string) =>
      catalogue.filter((c) => c.level === level).map((c) => c.code).sort()

    expect(byLevel('Advanced')).toEqual(['DISEC', 'UNSC'])
    expect(byLevel('Intermediate')).toEqual(['ICJ', 'UNHCR', 'UNHRC'])
    expect(byLevel('Beginner')).toHaveLength(catalogue.length - 5)
  })

  it('never asks a beginner room for a position paper', () => {
    // The committees section tells readers that beginner rooms take first-time
    // delegates and advanced ones want a paper. A beginner card whose meta line
    // demands one contradicts the paragraph directly above it.
    for (const committee of catalogue.filter((c) => c.level === 'Beginner')) {
      expect(committee.meta.join(' '), committee.code).not.toMatch(/position paper/i)
    }
  })

  it('gives every committee a seat count the hub would accept for a committee record', () => {
    for (const committee of catalogue) {
      const parsed = createCommitteeSchema.safeParse({
        name: committee.name,
        code: committee.code,
        totalSeats: committee.seats,
      })
      expect(parsed.success, `${committee.code}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true)
    }
  })

  it('never leaves a required display field blank', () => {
    for (const committee of catalogue) {
      expect(committee.name.trim(), `${committee.code} name`).not.toBe('')
      expect(committee.icon.trim(), `${committee.code} icon`).not.toBe('')
      expect(committee.blurb.trim(), `${committee.code} blurb`).not.toBe('')

      // meta is allowed to be empty: an ordinary single-delegation room has
      // nothing to add beyond its size and level, and the intro says the
      // delegation format once for all twelve. What is not allowed is an entry
      // that is there but says nothing.
      for (const line of committee.meta) {
        expect(line.trim(), `${committee.code} meta`).not.toBe('')
      }
      expect(['Beginner', 'Intermediate', 'Advanced']).toContain(committee.level)
    }
  })
})

describe('what the registration form submits', () => {
  it('formats every preference as "<name> (<CODE>)"', () => {
    for (const committee of catalogue) {
      expect(preferenceValue(committee)).toBe(`${committee.name} (${committee.code})`)
    }
  })

  it('is exactly what the listbox puts in the hidden input', () => {
    expect(options.map((o) => o.value)).toEqual(catalogue.map((c) => preferenceValue(c)))
    expect(options.map((o) => o.code)).toEqual(catalogue.map((c) => c.code))
    expect(options.map((o) => o.name)).toEqual(catalogue.map((c) => c.name))
  })

  it('keeps the longest preference under the 160-character limit', () => {
    const longest = catalogue
      .map((c) => preferenceValue(c))
      .sort((a: string, b: string) => b.length - a.length)[0] as string

    // Not UNOOSA, which is the runner-up. DISEC beats it by 2.
    expect(longest).toBe('Disarmament and International Security Committee (DISEC)')
    expect(longest.length, `longest preference is ${longest.length} characters`).toBeLessThanOrEqual(160)

    const unoosa = preferenceValue(catalogue.find((c) => c.code === 'UNOOSA')) as string
    expect(unoosa).toBe('United Nations Office for Outer Space Affairs (UNOOSA)')
    expect(unoosa.length).toBeLessThanOrEqual(160)
  })

  it('leaves room for a longer committee name later: nothing is close to the limit', () => {
    for (const committee of catalogue) {
      expect(preferenceValue(committee).length, committee.code).toBeLessThan(120)
    }
  })

  it('accepts every committee in both preference slots', () => {
    for (const first of catalogue) {
      for (const second of [catalogue[0] as Committee, catalogue[11] as Committee]) {
        const parsed = publicRegistrationSchema.safeParse(
          submission({
            committeePreference: preferenceValue(first),
            committeePreference2: preferenceValue(second),
          }),
        )
        expect(parsed.success, `${first.code}/${second.code}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true)
      }
    }
  })

  it('survives the round trip unchanged, so the hub shows what the delegate picked', () => {
    for (const committee of catalogue) {
      const parsed = publicRegistrationSchema.parse(
        submission({ committeePreference: preferenceValue(committee) }),
      )
      expect(parsed.committeePreference).toBe(preferenceValue(committee))
    }
  })

  it('treats an unpicked second preference as no preference rather than an error', () => {
    const parsed = publicRegistrationSchema.parse(
      submission({ committeePreference: preferenceValue(catalogue[0] as Committee), committeePreference2: '' }),
    )
    expect(parsed.committeePreference2).toBeNull()
  })
})

describe('the meta line under each card', () => {
  it('leads with the seat count and the right noun', () => {
    expect(metaLine(catalogue.find((c) => c.code === 'UNSC'))).toBe(
      '15 seats · Position paper required',
    )
    // An ordinary room has nothing to add, so the line is just its size.
    expect(metaLine(catalogue.find((c) => c.code === 'INTERPOL'))).toBe('35 seats')
    expect(metaLine(catalogue.find((c) => c.code === 'ICJ'))).toContain('35 places')
    expect(metaLine(catalogue.find((c) => c.code === 'IP'))).toContain('22 places')
  })

  it('uses "places" only where a delegate holds no country', () => {
    for (const committee of catalogue) {
      const expected = ['ICJ', 'IP'].includes(committee.code) ? 'places' : 'seats'
      expect(committee.seatNoun, committee.code).toBe(expected)
    }
  })
})

describe('the committee count quoted in register.html', () => {
  const registerHtml = readFileSync(path.join(siteRoot, 'register.html'), 'utf8')
  const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']

  it('has the hook register-main.js writes into', () => {
    expect(registerHtml).toContain('data-committee-count')
  })

  it('states a number that is already correct before the script runs', () => {
    const printed = /<span data-committee-count>([^<]*)<\/span>/.exec(registerHtml)?.[1]
    expect(printed, 'the static fallback is what a no-JS reader sees').toBe(WORDS[catalogue.length])
  })

  it('has a word for the current count, so it does not degrade to a bare numeral', () => {
    const registerMain = readFileSync(path.join(siteRoot, 'src/register-main.js'), 'utf8')
    const words = /const NUMBER_WORDS = \[([\s\S]*?)\]/.exec(registerMain)?.[1] ?? ''
    const parsed = words.match(/'([^']*)'/g)?.map((w) => w.slice(1, -1)) ?? []
    expect(parsed[catalogue.length], `no word for ${catalogue.length}`).toBe(WORDS[catalogue.length])
  })
})

describe('the icons the cards reference', () => {
  it('exists on disk for every committee', () => {
    const missing = catalogue.filter((committee) => {
      const file = path.join(siteRoot, 'assets/icons', `${committee.icon}.svg`)
      try {
        readFileSync(file)
        return false
      } catch {
        return true
      }
    })
    expect(missing.map((c) => `${c.code} -> assets/icons/${c.icon}.svg`)).toEqual([])
  })

  it('is a real SVG, not an empty or placeholder file', () => {
    for (const committee of catalogue) {
      const file = path.join(siteRoot, 'assets/icons', `${committee.icon}.svg`)
      const svg = readFileSync(file, 'utf8')
      expect(svg.length, `${committee.icon}.svg is empty`).toBeGreaterThan(40)
      expect(svg, `${committee.icon}.svg`).toContain('<svg')
      expect(svg.toLowerCase(), `${committee.icon}.svg`).not.toContain('placeholder')
    }
  })
})
