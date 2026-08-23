/**
 * Writes robots.txt and sitemap.xml into the composed dist/, and stamps the
 * canonical and og:url tags that need an absolute address.
 *
 * These are the only three things on the site that cannot be written as a
 * relative path: a sitemap entry, a canonical, and an og:url all have to name
 * the host. Rather than hardcode a domain into six HTML files and find out later
 * that one of them was missed, they are all stamped here from one value.
 *
 * SITE_URL is that value. The conference does not have its final domain yet
 * (TODO.md), so it defaults to the Vercel address the preview deploys use. When
 * the real domain is bought, set SITE_URL in the Vercel project and nothing else
 * has to change.
 *
 * Runs after scripts/compose-static.mjs, so dist/ already holds the built pages.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'dist')

const SITE_URL = (process.env['SITE_URL'] ?? 'https://lrimunx.vercel.app').replace(/\/+$/, '')

/**
 * The public pages, in the order a reader would meet them, with the priority
 * and change frequency each one has actually earned. The hub is not here and
 * never should be: it is noindex, and listing it in a sitemap would be an
 * invitation to crawl it.
 *
 * 404.html is not here either, for the obvious reason.
 */
const PAGES = [
  { path: '/', file: 'index.html', priority: '1.0', changefreq: 'weekly' },
  { path: '/register', file: 'register.html', priority: '0.9', changefreq: 'weekly' },
  { path: '/editions', file: 'editions.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/privacy', file: 'privacy.html', priority: '0.3', changefreq: 'yearly' },
  { path: '/colophon', file: 'colophon.html', priority: '0.2', changefreq: 'yearly' },
]

if (!existsSync(resolve(out, 'index.html'))) {
  throw new Error(
    'dist/index.html is missing, so this ran before the site was composed. ' +
      'build-seo.mjs must come after compose-static.mjs in the build script.',
  )
}

// --- canonical and og:url, stamped into each page -------------------------

const missing = []

for (const page of PAGES) {
  const file = resolve(out, page.file)
  if (!existsSync(file)) {
    missing.push(page.file)
    continue
  }

  let html = readFileSync(file, 'utf8')
  const url = `${SITE_URL}${page.path}`

  // Idempotent: a rebuild over an already-stamped file replaces rather than
  // appends, so running this twice cannot leave two canonicals on a page.
  html = html.replace(/\n?\s*<link rel="canonical"[^>]*>/g, '')
  html = html.replace(/\n?\s*<meta property="og:url"[^>]*>/g, '')

  const tags = `\n    <link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />`

  if (!html.includes('<meta property="og:type"')) {
    missing.push(`${page.file} (no og:type to anchor to)`)
    continue
  }

  html = html.replace('<meta property="og:type"', `${tags.trim()}\n    <meta property="og:type"`)
  writeFileSync(file, html)
}

if (missing.length > 0) {
  throw new Error(
    'These pages are in the sitemap list but could not be stamped:\n  ' +
      missing.join('\n  ') +
      '\n\nEither the page was renamed or removed, or its <head> changed shape. ' +
      'Fix PAGES in scripts/build-seo.mjs.',
  )
}

// --- sitemap.xml ----------------------------------------------------------

const today = new Date().toISOString().slice(0, 10)

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map(
  (page) => `  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
).join('\n')}
</urlset>
`

writeFileSync(resolve(out, 'sitemap.xml'), sitemap)

// --- robots.txt -----------------------------------------------------------

const robots = `# LRI Model UN X
# The operations hub is for the organising committee. It is noindex in its own
# head and behind a password; this is the belt to that pair of braces.

User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`

writeFileSync(resolve(out, 'robots.txt'), robots)

console.log(
  `[build] seo: ${PAGES.length} pages stamped, sitemap.xml and robots.txt written for ${SITE_URL}`,
)
