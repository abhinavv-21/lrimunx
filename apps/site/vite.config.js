import { defineConfig } from 'vite'
import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Copied verbatim rather than processed by Vite, because these are referenced
// by paths built at runtime, not by tags in the HTML. 'icons' joined the list
// when the committee cards moved from hardcoded markup to src/data/committees.js.
const RUNTIME_ONLY = ['oc', 'past-galleries', 'icons']
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
          filter: (p) => !p.endsWith('.md'),
        })
      }
    },
  }
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [copyAssets()],
  server: { port: 5174, open: false },
  build: {
    target: 'es2020',
    cssTarget: 'safari16',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        register: resolve(import.meta.dirname, 'register.html'),
        editions: resolve(import.meta.dirname, 'editions.html'),
        privacy: resolve(import.meta.dirname, 'privacy.html'),
        colophon: resolve(import.meta.dirname, 'colophon.html'),
        notFound: resolve(import.meta.dirname, '404.html'),
      },
      output: {
        entryFileNames: 'assets/build/[name].[hash].js',
        chunkFileNames: 'assets/build/[name].[hash].js',
        assetFileNames: 'assets/build/[name].[hash][extname]',
      },
    },
  },
})
