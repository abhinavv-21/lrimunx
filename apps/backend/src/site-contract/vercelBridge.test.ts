/**
 * api/index.ts is the only thing standing between a browser and the API on
 * Vercel. It has no other test, and on 2026-08-20 that showed: deployment
 * dpl_D2mhnaJg9CSFJEVTCSF91PsjczR5 shipped a *static* import of the built
 * backend, Vercel compiled the bridge to CommonJS, and every single request to
 * /api/v1/* and /health died before Express ever saw it:
 *
 *   Error [ERR_REQUIRE_ESM]: require() of ES Module
 *   /var/task/apps/backend/dist/app.js from /var/task/api/index.js not supported.
 *   Node.js process exited with exit status: 1.
 *
 * Vercel answered 500 FUNCTION_INVOCATION_FAILED. The registration form on the
 * public site treats any status that is not 201, 422 or 429 as "Something went
 * wrong at our end", so that is what applicants read for the 75 minutes the
 * broken build was live.
 *
 * These tests guard the bridge, not the routes. Everything below reads source
 * files, so it costs nothing and runs without a database.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')

const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

const bridge = read('api/index.ts')
const vercelConfig = JSON.parse(read('vercel.json')) as {
  functions?: Record<string, unknown>
  rewrites?: Array<{ source: string; destination: string }>
}

/** Lines that are neither blank, a comment, nor inside a block comment. */
function codeLines(source: string): string[] {
  const lines: string[] = []
  let inBlockComment = false

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false
      continue
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlockComment = true
      continue
    }
    if (line === '' || line.startsWith('//') || line.startsWith('*')) continue
    lines.push(line)
  }

  return lines
}

const bridgeCode = codeLines(bridge)

describe('the Vercel function that serves the API', () => {
  it('exists where vercel.json says it does, and takes /api/v1 and /health', () => {
    expect(Object.keys(vercelConfig.functions ?? {})).toContain('api/index.ts')

    const destinations = (vercelConfig.rewrites ?? [])
      .filter((r) => r.source.startsWith('/api/v1') || r.source === '/health')
      .map((r) => r.destination)

    expect(destinations).toContain('/api')
    expect(destinations.length).toBeGreaterThanOrEqual(2)
  })

  it('never statically imports the built backend, which is ESM', () => {
    // The exact shape that broke production: `import { createApp } from
    // '../apps/backend/dist/app.js'`. Vercel turns that into require().
    // `import x from '…'` / `import '…'`, but not `import('…')`, which is the
    // dynamic form and the whole point of the fix.
    const staticValueImports = bridgeCode.filter(
      (line) =>
        /^import\s+[^(]/.test(line) && !/^import\s+type\b/.test(line) && /apps\/backend\/dist/.test(line),
    )

    expect(
      staticValueImports,
      'api/index.ts static-imports the ESM backend; on Vercel this becomes require() and every request 500s with ERR_REQUIRE_ESM',
    ).toEqual([])
  })

  it('never require()s the built backend either', () => {
    const requires = bridgeCode.filter((line) => /require\s*\(/.test(line) && /apps\/backend\/dist/.test(line))

    expect(requires, 'require() of an ESM module throws ERR_REQUIRE_ESM at load').toEqual([])
  })

  it('loads the backend through a dynamic import instead', () => {
    const dynamicImports = [...bridge.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map(([, spec]) => spec)

    expect(dynamicImports, 'the bridge no longer import()s the backend at all').toContain(
      '../apps/backend/dist/app.js',
    )
  })

  it('is reaching for a module that is ESM, which is why require() is fatal there', () => {
    // The rules above are not style. They hold because the target really is
    // ESM. Note this cannot be reproduced by calling require() here: stock Node
    // 20.19+/22.12+ allows require(esm), while Vercel's bundled loader
    // (/opt/rust/nodejs.js in the production stack trace) does not, even on the
    // 24.x runtime this project is pinned to. The source contract is what is
    // checkable offline.
    expect(JSON.parse(read('apps/backend/package.json')).type).toBe('module')

    const built = path.join(repoRoot, 'apps/backend/dist/app.js')
    expect(existsSync(built), 'run `npm run build -w @lri-mun-x/backend` first').toBe(true)
  })
})

describe('what the bridge can report when the API will not start', () => {
  it('answers a failed load with JSON rather than letting Vercel answer', () => {
    // The catch block is the whole reason an applicant would see a readable
    // error rather than FUNCTION_INVOCATION_FAILED, so check it is still there.
    expect(bridge).toMatch(/catch\s*\(/)
    expect(bridge).toMatch(/statusCode\s*=\s*500/)
    expect(bridge).toMatch(/content-type['"]\s*,\s*['"]application\/json/)
  })

  it('cannot report a bad environment, because env.ts exits the process first', () => {
    // KNOWN FAILING. api/index.ts says its catch block exists so that "a
    // missing environment variable" produces a readable 500 "rather than
    // Vercel's opaque FUNCTION_INVOCATION_FAILED". It cannot: config/env.ts
    // calls process.exit(1) at module scope, so an invalid environment kills
    // the worker during `await import()` and nothing downstream ever runs.
    // Either env.ts should throw so the bridge can catch it, or the comment in
    // api/index.ts should stop promising a report it cannot produce.
    const envSource = read('apps/backend/src/config/env.ts')

    expect(
      codeLines(envSource).filter((line) => line.includes('process.exit')),
      'env.ts exits the process on bad config; the bridge catch block cannot see that',
    ).toEqual([])
  })
})
