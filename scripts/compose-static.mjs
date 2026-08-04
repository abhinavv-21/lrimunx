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
  console.log(`[build] ${workspace}/dist → ${destination.replace(root, '.')}`)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

copyBuild('apps/website', out)
copyBuild('apps/frontend', resolve(out, 'admin'))

console.log('[build] composed site + ops hub into ./dist')
