/**
 * Composes the two browser bundles into the static tree Cloudflare Pages serves.
 *
 *   dist/            the public conference site   (apps/website)
 *   dist/admin/      the OC operations hub        (apps/frontend)
 *   dist/_redirects  clean URLs and the hub's SPA fallback
 *   dist/_headers    noindex on the hub, immutable caching on fingerprinted assets
 *
 * DELIBERATELY SEPARATE FROM build-vercel.mjs, which it otherwise resembles.
 * That script is the one keeping production alive, and it does three things
 * this one must not: it generates the Prisma client, runs `migrate deploy`
 * against the live database, and builds the API into a serverless function.
 * Pages has no server to run any of that on, and a static build has no business
 * touching a database. Sharing a helper between the two would put the migration
 * step one careless edit away from a deploy that cannot use it.
 *
 * While the API stays on Vercel, the front ends reach it by absolute URL —
 * set VITE_API_BASE_URL in the Pages project. See MIGRATION.md.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'dist')

function copyBuild(workspace, destination) {
  const from = resolve(root, workspace, 'dist')
  if (!existsSync(from)) {
    throw new Error(
      `${workspace} has no dist/ — its build did not run or failed silently. ` +
        'Check the build command ordering in package.json.',
    )
  }
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(from, destination, { recursive: true })
  console.log(`[pages] ${workspace}/dist → ${destination.replace(root, '.')}`)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

copyBuild('apps/website', out)
copyBuild('apps/frontend', resolve(out, 'admin'))

// Copied last, so a stale pair from a previous run cannot survive and neither
// front end's build output can overwrite them.
const control = resolve(root, 'deploy/cloudflare')
for (const file of ['_redirects', '_headers']) {
  const from = resolve(control, file)
  if (!existsSync(from)) throw new Error(`deploy/cloudflare/${file} is missing — Pages needs it.`)
  cpSync(from, resolve(out, file))
  console.log(`[pages] deploy/cloudflare/${file} → ./dist/${file}`)
}

/*
  Refuse to ship a bundle that still points at a developer's machine.

  VITE_API_BASE_URL is read by Vite at build time and baked into the bundle. If
  it is not set in the Pages project, the hub falls back to
  http://localhost:4000/api/v1 and deploys perfectly successfully — and is then
  completely dead for every visitor, with no error anywhere in the build log.
  It has already happened once on this machine.

  The artifact is checked rather than the environment variable, because that is
  the thing being deployed: it catches a missing variable, a misspelt one, and a
  stale dist/ left over from a local build, all with the same test.
*/
/*
  A PORT is required in the pattern, and that is the whole trick.

  `@vercel/blob/client` contains a legitimate runtime feature-detect that reads
  `startsWith("http://localhost")` — bare, no port. Matching that flagged a
  perfectly good build. Every fallback this project can actually leak carries a
  port (:4000 for the API, :5173/:5174 for the dev servers), so requiring one
  separates our misconfiguration from a vendor's internals without having to
  keep a list of files to ignore.
*/
const LEAKED_DEV_URL = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+/

function eachAsset(dir, visit) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) { eachAsset(path, visit); continue }
    if (/\.(js|css|html|webmanifest)$/.test(entry.name)) visit(path, readFileSync(path, 'utf8'))
  }
}

function assertDeployable(dir) {
  const offenders = []
  let apiBaseSeen = false
  const expected = process.env['VITE_API_BASE_URL']?.trim()

  eachAsset(dir, (path, source) => {
    const match = LEAKED_DEV_URL.exec(source)
    if (match) offenders.push(`${path.replace(out, 'dist')} → ${match[0]}`)
    if (expected && source.includes(expected)) apiBaseSeen = true
  })

  if (offenders.length > 0) {
    throw new Error(
      'This build points at a development server and would deploy dead:\n  ' +
        offenders.slice(0, 5).join('\n  ') +
        '\n\nSet VITE_API_BASE_URL to the deployed API root (including /api/v1) ' +
        'in the Pages project, then build again.',
    )
  }

  // Positive proof, not just the absence of the bad value: a typo in the
  // variable's NAME leaves no localhost behind either, and would otherwise pass.
  if (expected && !apiBaseSeen) {
    throw new Error(
      `VITE_API_BASE_URL is set to ${expected}, but that string is nowhere in the ` +
        'built bundle. The build did not pick it up — check the variable name and ' +
        'that it is set for the build, not just the runtime.',
    )
  }

  console.log(
    expected
      ? `[pages] checked: no dev URL in the bundle, and the API base is baked in`
      : '[pages] checked: no dev URL in the bundle (VITE_API_BASE_URL was not set here)',
  )
}

assertDeployable(out)

console.log('[pages] composed site + ops hub for Cloudflare Pages into ./dist')
