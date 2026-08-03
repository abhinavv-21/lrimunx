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
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
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

console.log('[pages] composed site + ops hub for Cloudflare Pages into ./dist')
