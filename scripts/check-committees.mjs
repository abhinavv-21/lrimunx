/**
 * Fails if the committee list on the site and the one in the database seed
 * disagree.
 *
 * They have to be two literals: the seed is TypeScript run by tsx inside the
 * Prisma workspace and cannot import an ESM module out of apps/site. So instead
 * of trusting people to edit both, this compares them.
 *
 * This is not hypothetical. Before it existed the site advertised HCC while the
 * seed created UNEP, and the site sold 230 seats against a database that held
 * 178. `totalSeats` is enforced at allocation time, so that gap only surfaces
 * when a delegate is turned away.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const { COMMITTEES } = await import(
  new URL('../apps/site/src/data/committees.js', import.meta.url).href
)

// Strip comments first. `matchAll` over raw text counted a commented-out entry
// as present, so the check passed while the seed never created the committee.
const seedSource = stripComments(readFileSync(resolve(root, 'prisma/seed.ts'), 'utf8'))
const block = seedSource.match(/const STANDARD_COMMITTEES = \[([\s\S]*?)\n\]/)

if (!block) {
  fail(['Could not find STANDARD_COMMITTEES in prisma/seed.ts. Did the array get renamed?'])
}

const seed = [...block[1].matchAll(/\{\s*name:\s*'([^']*)',\s*code:\s*'([^']*)',\s*totalSeats:\s*(\d+)\s*\}/g)].map(
  ([, name, code, totalSeats]) => ({ name, code, totalSeats: Number(totalSeats) }),
)

const problems = []

if (seed.length !== COMMITTEES.length) {
  problems.push(
    `Count: the site lists ${COMMITTEES.length} committees, the seed creates ${seed.length}.`,
  )
}

const seedByCode = new Map(seed.map((c) => [c.code, c]))

for (const committee of COMMITTEES) {
  const match = seedByCode.get(committee.code)

  if (!match) {
    problems.push(`${committee.code} is on the site but not in prisma/seed.ts.`)
    continue
  }

  if (match.name !== committee.name) {
    problems.push(
      `${committee.code} name: site says "${committee.name}", seed says "${match.name}".`,
    )
  }

  if (!Number.isInteger(committee.seats) || committee.seats < 1) {
    problems.push(
      `${committee.code} seats: ${committee.seats} is not a usable seat count. ` +
        'createCommitteeSchema requires at least 1, so the hub would refuse to create it.',
    )
  }

  if (match.totalSeats !== committee.seats) {
    problems.push(
      `${committee.code} seats: site advertises ${committee.seats}, seed creates ${match.totalSeats}. ` +
        'The API enforces the seed value, so the site is promising seats the hub will refuse.',
    )
  }

  seedByCode.delete(committee.code)
}

for (const code of seedByCode.keys()) {
  problems.push(`${code} is in prisma/seed.ts but not on the site.`)
}

if (problems.length > 0) fail(problems)

const seats = COMMITTEES.reduce((total, c) => total + c.seats, 0)
console.log(
  `[committees] ${COMMITTEES.length} committees, ${seats} seats, site and seed agree.`,
)

/**
 * Drops `//` and block comments before the array is parsed.
 *
 * Without this, a commented-out entry still matched, so the check reported
 * agreement while the seed never created that committee. The failure would then
 * only surface as an allocation being refused for a committee the site listed.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

function fail(lines) {
  console.error('\nThe committee list on the site does not match prisma/seed.ts:\n')
  for (const line of lines) console.error(`  ${line}`)
  console.error(
    '\nsrc/data/committees.js is the source of truth. Mirror code, name and seats\n' +
      'into STANDARD_COMMITTEES in prisma/seed.ts.\n',
  )
  process.exit(1)
}
