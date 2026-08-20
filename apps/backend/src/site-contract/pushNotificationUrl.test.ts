/**
 * The hub is served under /admin/. A push notification carries a URL that the
 * service worker hands straight to client.navigate(), so any URL that is not
 * under that base lands outside the hub.
 *
 * sw.ts had its two fallback URLs corrected to /admin/... . The fallbacks are
 * only reached when the payload omits `url`, and the one place that sends a
 * push always sets it. These tests check the value that is actually sent.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')

const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

const hubConfig = read('apps/hub/vite.config.ts')
const sw = read('apps/hub/src/sw.ts')
const logisticsRoutes = read('apps/backend/src/routes/logistics.routes.ts')

/** '/admin/' */
const BASE = /const BASE = '([^']*)'/.exec(hubConfig)?.[1] ?? ''

/** Every string literal assigned to a `url:` key in a source file. */
function urlLiterals(source: string): string[] {
  return [...source.matchAll(/url:\s*[`'"]([^`'"]*)[`'"]/g)].map(([, url]) => url as string)
}

describe('push notification targets', () => {
  it('knows the base the hub is served under', () => {
    expect(BASE, 'BASE was renamed in apps/hub/vite.config.ts').toBe('/admin/')
  })

  it('sends the service worker a URL inside the hub', () => {
    const urls = urlLiterals(logisticsRoutes)
    expect(urls.length, 'no push url found; did the payload move?').toBeGreaterThan(0)

    const outside = urls.filter((url) => url.startsWith('/') && !url.startsWith(BASE))
    expect(
      outside,
      'notificationclick calls client.navigate(url) verbatim, so these never reach the hub',
    ).toEqual([])
  })

  it('falls back to a URL inside the hub when the payload omits one', () => {
    const fallbacks = [...sw.matchAll(/\?\?\s*'(\/[^']*)'/g)].map(([, url]) => url as string)
    expect(fallbacks.length).toBeGreaterThan(0)
    for (const url of fallbacks) {
      expect(url.startsWith(BASE) || url === BASE.replace(/\/$/, '')).toBe(true)
    }
  })

  it('points the notification icon at a file the hub actually serves', () => {
    const icons = [...sw.matchAll(/(?:icon|badge):\s*'(\/[^']*)'/g)].map(([, url]) => url as string)
    expect(icons.length).toBeGreaterThan(0)
    for (const url of icons) {
      expect(url.startsWith(BASE), `${url} is not under ${BASE}`).toBe(true)
      const onDisk = path.join(repoRoot, 'apps/hub/public', url.slice(BASE.length))
      expect(readFileSync(onDisk).length, `${url} has no file behind it`).toBeGreaterThan(0)
    }
  })
})
