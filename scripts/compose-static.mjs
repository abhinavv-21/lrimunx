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

copyBuild('apps/site', out)
copyBuild('apps/hub', resolve(out, 'admin'))

const API_BASE_IN_BUNDLE = /https?:\/\/([a-zA-Z0-9.-]+)(?::(\d+))?\/api\/v1/g

function assertReachableApiBase(dir) {
  const found = new Map()

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
