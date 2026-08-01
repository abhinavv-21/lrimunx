/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope

/* ------------------------------ Precaching -------------------------------- */

const manifest = self.__WB_MANIFEST

cleanupOutdatedCaches()
precacheAndRoute(manifest)

// SPA navigations resolve from the precached shell so the app opens offline.
//
// createHandlerBoundToURL throws if the URL was never precached, which would
// take down the whole worker and leave every navigation unanswered. Only wire
// the route up once index.html is genuinely in the manifest.
const shellPrecached = manifest.some((entry) =>
  typeof entry === 'string' ? entry.includes('index.html') : entry.url.includes('index.html'),
)

if (shellPrecached) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }))
} else {
  console.warn('[sw] index.html is not precached — navigation falls through to the network.')
}

/* --------------------------- Runtime caching ------------------------------ */

// Google Fonts stylesheets change rarely; the app must still render offline.
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new NetworkFirst({ cacheName: 'google-fonts-stylesheets' }),
)

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
)

/**
 * Read-only reference data is served network-first with a short-lived cache so
 * a dropped connection still shows the last known roster instead of an error.
 * Writes are never cached — they go through the Dexie queue in the app.
 */
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.pathname.startsWith('/api/v1/') &&
    /\/(committees|delegates|dashboard|attendance)/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'api-reference',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 6 }),
    ],
  }),
)

/* ------------------------------ Web Push ---------------------------------- */

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return

  let payload: PushPayload
  try {
    payload = event.data.json() as PushPayload
  } catch {
    payload = { title: 'LRI MUN X', body: event.data.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag ?? 'munx',
      data: { url: payload.url ?? '/logistics' },
      // High-priority logistics alerts must survive a pocket.
      requireInteraction: true,
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/'

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Focus an existing tab rather than opening a duplicate.
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }

      await self.clients.openWindow(target)
    })(),
  )
})

/* ------------------------------ Lifecycle --------------------------------- */

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})
