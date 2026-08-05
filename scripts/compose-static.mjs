/**
 * Composes the two browser bundles into the single static tree that gets served.
 *
 *   dist/            the public conference site   (apps/website)
 *   dist/admin/      the OC operations hub        (apps/frontend)
 *
 * Platform-neutral on purpose, and shared by both deploys: Vercel reaches it
 * through `vercel-build`, Render through `render-build`. It only copies files —
 * there was never anything Vercel-specific in here, and the old name implied
 * otherwise. Where the API lives is somebody else's problem; on Vercel it is a
 * serverless function under `api/`, on Render a separate web service.
 *
 * Ordering matters: the website is copied first and the ops hub second, into a
 * subdirectory. Copying in the other order would let the website's root-level
 * index.html overwrite nothing, but a stale dist/ from a previous run could
 * leave orphaned files, so the tree is cleared first.
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
  console.log(`[build] ${workspace}/dist → ${destination.replace(root, '.')}`)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

copyBuild('apps/website', out)
copyBuild('apps/frontend', resolve(out, 'admin'))

/*
  Refuse to ship a bundle whose API base a browser cannot reach.

  VITE_API_BASE_URL is read by Vite at BUILD time and baked in, so a wrong value
  produces a deploy that is green everywhere and dead for every visitor. Two
  ways that has actually happened on this project:

    http://localhost:4000/api/v1   the variable was not set at all, and the
                                   hub fell back to its development default
    https://lrimunx-api/api/v1     Render's fromService `host` returns the
                                   INTERNAL service name, which is ENOTFOUND
                                   from any browser

  The second one is why this checks the ARTIFACT rather than the variable, and
  why a hostname with no dot in it is a failure: nothing publicly resolvable
  looks like that. Checking the API answers would not have caught it either —
  the API was perfectly healthy; it was the address that was wrong.
*/
const API_BASE_IN_BUNDLE = /https?:\/\/([a-zA-Z0-9.-]+)(?::(\d+))?\/api\/v1/g

function assertReachableApiBase(dir) {
  const found = new Map() // url -> first file it appeared in

  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name)
      if (entry.isDirectory()) { walk(path); continue }
      if (!/\.(js|css|html|webmanifest)$/.test(entry.name)) continue
      const source = readFileSync(path, 'utf8')
      for (const match of source.matchAll(API_BASE_IN_BUNDLE)) {
        if (!found.has(match[0])) found.set(match[0], { file: path, host: match[1] ?? '' })
      }
    }
  }
  walk(dir)

  const bad = [...found.entries()].filter(([, { host }]) => {
    const local = host === 'localhost' || host === '127.0.0.1'
    const unresolvable = !host.includes('.')
    return local || unresolvable
  })

  if (bad.length > 0) {
    throw new Error(
      'This build has an API base no browser can reach:\n  ' +
        bad.map(([url, { file }]) => `${url}   (in ${file.replace(out, 'dist')})`).join('\n  ') +
        '\n\nSet VITE_API_BASE_URL to the PUBLIC API root, scheme and /api/v1 included, ' +
        'e.g. https://lrimunx-api.onrender.com/api/v1 — then build again.',
    )
  }

  console.log(
    found.size > 0
      ? `[build] checked: API base is ${[...found.keys()].join(', ')}`
      : '[build] checked: no absolute API base in the bundle (same-origin deploy)',
  )
}

assertReachableApiBase(out)
console.log('[build] composed site + ops hub into ./dist')
