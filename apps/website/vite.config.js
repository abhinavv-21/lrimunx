import { defineConfig } from 'vite'
import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * `assets/` lives at the project root (a sibling of `src/`, per CLAUDE.md), not in
 * Vite's `public/` directory. In dev, Vite already serves any file under the project
 * root, so `/assets/...` resolves with no extra config. For `build`, this plugin
 * mirrors into `dist/` so the same absolute paths keep working in prod.
 *
 * Only the two directories Vite CANNOT see are mirrored. `oc.js` and `gallery.js`
 * build those URLs as runtime template literals, so nothing in the module graph
 * references them and Vite never emits them. Everything else — fonts, icons, the
 * logos — is imported from HTML or CSS and is already emitted with a content
 * hash, so mirroring it too shipped ~333 KB of files that are never requested.
 */
const RUNTIME_ONLY = ['oc', 'past-galleries']
function copyAssets() {
  return {
    name: 'lri-copy-assets',
    apply: 'build',
    closeBundle() {
      const from = resolve(import.meta.dirname, 'assets')
      if (!existsSync(from)) return
      for (const dir of RUNTIME_ONLY) {
        const src = resolve(from, dir)
        if (!existsSync(src)) continue
        cpSync(src, resolve(import.meta.dirname, 'dist/assets', dir), {
          recursive: true,
          // The per-folder notes for whoever is dropping in the real assets are
          // documentation, not payload.
          filter: (p) => !p.endsWith('.md'),
        })
      }
    },
  }
}

export default defineConfig({
  // RELATIVE base, deliberately. With an absolute '/', every asset URL resolves
  // against the domain root — so on GitHub Pages at /lrimunx/ the bundle was
  // requested from github.io/assets/... and 404'd, leaving only the inline
  // critical CSS painting a bare plum page.
  //
  // './' resolves against the document instead, so the same build works at the
  // domain root, at /lrimunx/, or in any folder the school drops it into. This
  // is a single-page site with no client-side routing, so there is no depth for
  // relative paths to get wrong.
  base: './',
  publicDir: false,
  plugins: [copyAssets()],
  server: { port: 5174, open: false },
  build: {
    target: 'es2020',
    cssTarget: 'safari16',
    // Never inline. Base64 costs +33% over the wire, and it was pushing ~20 KB
    // of logo and icon data into the document that carries the LCP element.
    assetsInlineLimit: 0,
    // Single JS + single CSS file: the whole point of the stack decision is that
    // the output can be pasted into an existing CMS template.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/build/[name].[hash].js',
        chunkFileNames: 'assets/build/[name].[hash].js',
        assetFileNames: 'assets/build/[name].[hash][extname]',
      },
    },
  },
})
