/**
 * Fails if a public page loses something every public page has to have.
 *
 * Three things, all of which were correct when this was written and all of
 * which are one careless copy-paste away from not being:
 *
 *   alt          every <img> needs one. An empty alt="" is correct and expected
 *                for decoration; a missing attribute is a screen reader reading
 *                out a filename.
 *   description  a page without one gets whatever Google decides to scrape.
 *   chrome       the nav, the footer and the copyright line are duplicated
 *                across six files because these are static pages with no
 *                templating. Duplication is fine; silent divergence is not.
 *
 * This checks the source in apps/site, not the build, so it fails before a
 * broken page is ever composed.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const siteDir = resolve(root, 'apps/site')

const pages = readdirSync(siteDir).filter((name) => name.endsWith('.html'))

if (pages.length === 0) {
  fail(['No HTML pages found in apps/site. Did the directory move?'])
}

const problems = []

/** The line that says who owns this. It is the one every page must agree on. */
const COPYRIGHT = 'LRI MUN X Organising Committee. All rights reserved.'

for (const page of pages) {
  const raw = readFileSync(resolve(siteDir, page), 'utf8')

  // Comments first. check-committees.mjs learned this on the JavaScript side: a
  // commented-out entry matched, the check passed, and the thing it guarded was
  // not there. Here the comment explaining why the About plate has no <img> yet
  // contains the string "<img>", which was enough to fail a correct page.
  const html = stripComments(raw)

  // <img ...> tags, including ones written across several lines.
  const images = html.match(/<img\b[^>]*>/gs) ?? []
  images.forEach((tag, index) => {
    // Whitespace before it, not a word boundary: \balt= also matches data-alt=,
    // which is how the first version of this check passed a tag it should have
    // failed.
    if (!/\salt\s*=/.test(tag)) {
      const summary = tag.replace(/\s+/g, ' ').slice(0, 80)
      problems.push(`${page}: image ${index + 1} has no alt attribute — ${summary}…`)
    }
  })

  if (!/<title>[^<]{10,}<\/title>/.test(html)) {
    problems.push(`${page}: no <title>, or one too short to say anything.`)
  }

  const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/s)
  if (!description) {
    problems.push(`${page}: no <meta name="description">.`)
  } else if (description[1].trim().length < 50) {
    problems.push(
      `${page}: the meta description is ${description[1].trim().length} characters. ` +
        'Under 50 and it is not describing anything.',
    )
  }

  if (!html.includes(COPYRIGHT)) {
    problems.push(
      `${page}: the footer copyright does not match the other pages. ` +
        `Expected it to contain "${COPYRIGHT}".`,
    )
  }

  // The one attribute that decides whether a page is indexed at all. Worth
  // noticing when it appears somewhere it was not meant to.
  const robots = html.match(/<meta\s+name="robots"\s+content="([^"]*)"/)
  const shouldBeNoindex = page === 'register.html' || page === '404.html'
  const isNoindex = Boolean(robots && robots[1].includes('noindex'))
  if (shouldBeNoindex !== isNoindex) {
    problems.push(
      `${page}: robots is ${isNoindex ? 'noindex' : 'indexable'} and should be ` +
        `${shouldBeNoindex ? 'noindex' : 'indexable'}.`,
    )
  }
}

if (problems.length > 0) fail(problems)

const imageCount = pages.reduce((total, page) => {
  const html = stripComments(readFileSync(resolve(siteDir, page), 'utf8'))
  return total + (html.match(/<img\b/g) ?? []).length
}, 0)

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

console.log(
  `[pages] ${pages.length} pages, ${imageCount} images, all with alt text, titles, descriptions and the same footer.`,
)

function fail(lines) {
  console.error('')
  console.error('Something a public page needs is missing:')
  console.error('')
  for (const line of lines) console.error(`  ${line}`)
  console.error('')
  process.exit(1)
}
