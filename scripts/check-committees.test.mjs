/**
 * Mutation tests for check-committees.mjs.
 *
 * The drift check is the only thing stopping the site and prisma/seed.ts from
 * disagreeing again, so it has to actually fail when they do. Each case copies
 * the three real files into a throwaway tree, corrupts one of them, and runs
 * the check there. Nothing in the repository is written to.
 *
 *   node --test scripts/check-committees.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const REAL = {
  script: readFileSync(join(root, 'scripts/check-committees.mjs'), 'utf8'),
  committees: readFileSync(join(root, 'apps/site/src/data/committees.js'), 'utf8'),
  seed: readFileSync(join(root, 'prisma/seed.ts'), 'utf8'),
}

/** Runs the check against a sandboxed copy. Returns { code, stdout, stderr }. */
function runCheck({ committees = REAL.committees, seed = REAL.seed } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cc-'))
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    mkdirSync(join(dir, 'prisma'), { recursive: true })
    mkdirSync(join(dir, 'apps/site/src/data'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}')
    writeFileSync(join(dir, 'scripts/check-committees.mjs'), REAL.script)
    writeFileSync(join(dir, 'prisma/seed.ts'), seed)
    writeFileSync(join(dir, 'apps/site/src/data/committees.js'), committees)

    try {
      const stdout = execFileSync(process.execPath, [join(dir, 'scripts/check-committees.mjs')], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return { code: 0, stdout, stderr: '' }
    } catch (error) {
      return { code: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Replaces exactly once, and blows up if the anchor moved. */
function edit(source, from, to) {
  const parts = source.split(from)
  assert.equal(parts.length, 2, `anchor is not unique or is missing: ${JSON.stringify(from)}`)
  return parts.join(to)
}

const mustFail = (result, why) =>
  assert.equal(
    result.code,
    1,
    `${why}\nexpected exit 1, got ${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  )

// --- the sandbox itself has to be trustworthy ------------------------------

test('the untouched tree passes, so a failure below means the mutation was caught', () => {
  const result = runCheck()
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /12 committees, 400 seats, site and seed agree/)
})

// --- renames ---------------------------------------------------------------

test('a committee renamed on the site only is caught', () => {
  const result = runCheck({
    committees: edit(REAL.committees, "name: 'UN Women',", "name: 'UN Womens',"),
  })
  mustFail(result, 'site renamed UN Women')
  assert.match(result.stderr, /UNWOMEN name/)
})

test('a committee renamed in the seed only is caught', () => {
  const result = runCheck({
    seed: edit(
      REAL.seed,
      "{ name: 'UN Women', code: 'UNWOMEN'",
      "{ name: 'UN Womxn', code: 'UNWOMEN'",
    ),
  })
  mustFail(result, 'seed renamed UN Women')
  assert.match(result.stderr, /UNWOMEN name/)
})

test('a code renamed on the site only is caught', () => {
  const result = runCheck({ committees: edit(REAL.committees, "code: 'HCC'", "code: 'HCC3'") })
  mustFail(result, 'site renamed the HCC code')
  assert.match(result.stderr, /HCC3 is on the site but not in prisma\/seed\.ts/)
  assert.match(result.stderr, /HCC is in prisma\/seed\.ts but not on the site/)
})

// --- seat counts, the failure that only surfaces at allocation time ---------

test('a seat count raised on the site only is caught', () => {
  const result = runCheck({
    committees: edit(REAL.committees, 'seats: 50,\n    seatNoun', 'seats: 80,\n    seatNoun'),
  })
  mustFail(result, 'site oversold DISEC')
  assert.match(result.stderr, /DISEC seats: site advertises 80, seed creates 50/)
})

test('a seat count changed in the seed only is caught', () => {
  const result = runCheck({
    seed: edit(REAL.seed, "code: 'DISEC', totalSeats: 50", "code: 'DISEC', totalSeats: 20"),
  })
  mustFail(result, 'seed shrank DISEC')
  assert.match(result.stderr, /DISEC seats: site advertises 50, seed creates 20/)
})

test('a one-seat drift is caught, not rounded away', () => {
  const result = runCheck({
    seed: edit(REAL.seed, "code: 'ICJ', totalSeats: 15", "code: 'ICJ', totalSeats: 14"),
  })
  mustFail(result, 'off-by-one on ICJ')
  assert.match(result.stderr, /ICJ seats: site advertises 15, seed creates 14/)
})

// --- additions and removals ------------------------------------------------

test('a committee added to the site only is caught', () => {
  const extra = [
    '  {',
    "    code: 'WHO',",
    "    name: 'World Health Organization',",
    "    icon: 'who',",
    "    level: 'Beginner',",
    '    seats: 40,',
    "    seatNoun: 'seats',",
    "    meta: ['Single-delegate'],",
    "    blurb: 'Health.',",
    '    agenda: null,',
    '    chair: null,',
    '    viceChair: null,',
    '  },',
    ']',
  ].join('\n')
  const result = runCheck({ committees: edit(REAL.committees, '\n]', `\n${extra}`) })
  mustFail(result, 'site gained WHO')
  assert.match(result.stderr, /WHO is on the site but not in prisma\/seed\.ts/)
})

test('a committee added to the seed only is caught', () => {
  const result = runCheck({
    seed: edit(
      REAL.seed,
      "  { name: 'International Press', code: 'IP', totalSeats: 15 },",
      "  { name: 'International Press', code: 'IP', totalSeats: 15 },\n" +
        "  { name: 'World Health Organization', code: 'WHO', totalSeats: 40 },",
    ),
  })
  mustFail(result, 'seed gained WHO')
  assert.match(result.stderr, /WHO is in prisma\/seed\.ts but not on the site/)
})

test('a committee removed from the seed only is caught', () => {
  const result = runCheck({
    seed: edit(REAL.seed, "  { name: 'UN Women', code: 'UNWOMEN', totalSeats: 30 },\n", ''),
  })
  mustFail(result, 'seed dropped UN Women')
  assert.match(result.stderr, /UNWOMEN is on the site but not in prisma\/seed\.ts/)
})

test('an empty site list against a full seed is caught, not treated as nothing to compare', () => {
  const result = runCheck({ committees: 'export const COMMITTEES = []\n' })
  mustFail(result, 'site list emptied')
  assert.match(result.stderr, /the site lists 0 committees, the seed creates 12/)
})

// --- the regex must never match zero entries and call that agreement --------

test('double-quoted seed entries fail loudly instead of matching nothing', () => {
  const seed = REAL.seed.replace(
    /\{ name: '([^']*)', code: '([^']*)', totalSeats: (\d+) \}/g,
    (_m, name, code, seats) => `{ name: "${name}", code: "${code}", totalSeats: ${seats} }`,
  )
  assert.ok(seed.includes('{ name: "UN Women"'), 'the quote-style rewrite did not apply')
  const result = runCheck({ seed })
  mustFail(result, 'seed switched to double quotes: the entry regex matches nothing')
  assert.match(result.stderr, /the seed creates 0/)
})

test('a trailing comma inside a seed entry fails loudly', () => {
  const result = runCheck({
    seed: edit(REAL.seed, "code: 'ICJ', totalSeats: 15 }", "code: 'ICJ', totalSeats: 15, }"),
  })
  mustFail(result, 'trailing comma stops the entry regex matching ICJ')
})

test('seed properties reordered fail loudly rather than being skipped silently', () => {
  const result = runCheck({
    seed: edit(
      REAL.seed,
      "{ name: 'UN Women', code: 'UNWOMEN', totalSeats: 30 }",
      "{ code: 'UNWOMEN', name: 'UN Women', totalSeats: 30 }",
    ),
  })
  mustFail(result, 'property order change hides UNWOMEN from the regex')
})

test('renaming STANDARD_COMMITTEES is reported, not silently ignored', () => {
  const result = runCheck({
    seed: edit(REAL.seed, 'const STANDARD_COMMITTEES = [', 'const SEED_COMMITTEES = ['),
  })
  mustFail(result, 'the array was renamed')
  assert.match(result.stderr, /Could not find STANDARD_COMMITTEES/)
})

test('a type annotation on STANDARD_COMMITTEES is reported', () => {
  const result = runCheck({
    seed: edit(
      REAL.seed,
      'const STANDARD_COMMITTEES = [',
      'const STANDARD_COMMITTEES: Committee[] = [',
    ),
  })
  mustFail(result, 'a type annotation breaks the block regex')
  assert.match(result.stderr, /Could not find STANDARD_COMMITTEES/)
})

// --- shapes that are legitimately fine -------------------------------------

test('reordering the seed array is not drift, because order carries no meaning there', () => {
  const lines = REAL.seed.split('\n')
  const start = lines.findIndex((l) => l.includes('const STANDARD_COMMITTEES = ['))
  const end = lines.findIndex((l, i) => i > start && l.trim() === ']')
  const reordered = [...lines.slice(start + 1, end)].reverse()
  const seed = [...lines.slice(0, start + 1), ...reordered, ...lines.slice(end)].join('\n')
  assert.ok(seed.includes("code: 'HCC'"), 'the reorder lost an entry')
  const result = runCheck({ seed })
  assert.equal(result.code, 0, `reordering the seed should still pass\n${result.stderr}`)
})

test('a seed entry split across lines still matches', () => {
  const result = runCheck({
    seed: edit(
      REAL.seed,
      "  { name: 'International Press', code: 'IP', totalSeats: 15 },",
      "  {\n    name: 'International Press',\n    code: 'IP',\n    totalSeats: 15\n  },",
    ),
  })
  assert.equal(result.code, 0, `reformatting one entry across lines should still pass\n${result.stderr}`)
})

// --- known holes: these document current behaviour, not desired behaviour ---

test('a commented-out seed entry is not counted as present', () => {
  const result = runCheck({
    seed: edit(
      REAL.seed,
      "  { name: 'UN Women', code: 'UNWOMEN', totalSeats: 30 },",
      "  // { name: 'UN Women', code: 'UNWOMEN', totalSeats: 30 },",
    ),
  })
  mustFail(
    result,
    'UNWOMEN is commented out of the seed, so the database will never get it, ' +
      'but the check scans raw text and still sees the entry',
  )
})

test('a committee with zero seats is rejected', () => {
  const result = runCheck({
    committees: edit(REAL.committees, 'seats: 30,\n    seatNoun', 'seats: 0,\n    seatNoun'),
    seed: edit(REAL.seed, "code: 'UNWOMEN', totalSeats: 30", "code: 'UNWOMEN', totalSeats: 0"),
  })
  mustFail(
    result,
    'a committee advertising "0 seats" is nonsense, but the two sides agree so nothing complains',
  )
})
