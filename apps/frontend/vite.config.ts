import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

/**
 * The ops hub is served under /admin, beside the public conference site at the
 * domain root. The base path is threaded through Vite, the router basename, the
 * PWA manifest and the service worker scope — they must agree or the app loads
 * its assets from the wrong place, or the worker claims the public site too.
 */
const BASE = '/admin/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // injectManifest so we own the service worker source — the default
      // generateSW cannot host our push and notificationclick handlers.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
      devOptions: {
        // Deliberately off. In dev the precache manifest is empty, so the
        // service worker's navigation route has nothing to serve and takes
        // over the page with a blank shell. The worker is exercised against
        // `npm run build && npm run preview`, where the manifest is real.
        enabled: false,
        type: 'module',
      },
      manifest: {
        name: 'LRI MUN X Operations Hub',
        short_name: 'MUN X Ops',
        description: 'Delegates, committees, logistics and attendance for LRI MUN X.',
        theme_color: '#2F0924',
        background_color: '#2F0924',
        display: 'standalone',
        orientation: 'any',
        id: BASE,
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: `${BASE}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${BASE}icons/icon-512-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    // Not published. The hub is noindex'd but reachable by anyone who knows the
    // path, and shipping .js.map hands a stranger the readable source of the
    // app that runs the conference. Turn it on locally when you need to debug a
    // production build.
    sourcemap: false,
  },
})
