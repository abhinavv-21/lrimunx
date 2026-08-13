import express, { type Express } from 'express'
import fs from 'node:fs'
import path from 'node:path'

const IMMUTABLE = 'public, max-age=31536000, immutable'
const HAS_EXTENSION = /\.[a-z0-9]+$/i

export function mountStatic(app: Express, root: string): void {
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    console.warn(
      `[static] SERVE_STATIC is on but no index.html was found in ${root}. ` +
        'Run the build and scripts/compose-static.mjs first.',
    )
    return
  }

  const siteIndex = path.join(root, 'index.html')
  const registerPage = path.join(root, 'register.html')
  const adminIndex = path.join(root, 'admin', 'index.html')

  app.use((req, res, next) => {
    if (req.path === '/admin' || req.path.startsWith('/admin/')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow')
      res.setHeader('X-Frame-Options', 'DENY')
      res.setHeader('Referrer-Policy', 'same-origin')
    }
    next()
  })

  app.get('/', (_req, res) => {
    res.sendFile(siteIndex)
  })

  app.get('/register', (_req, res) => {
    res.sendFile(registerPage)
  })

  app.use(
    express.static(root, {
      index: false,
      redirect: false,
      setHeaders(res, filePath) {
        const relative = path.relative(root, filePath).split(path.sep).join('/')
        if (relative.startsWith('assets/build/') || relative.startsWith('admin/assets/')) {
          res.setHeader('Cache-Control', IMMUTABLE)
        }
      },
    }),
  )

  app.get(/^\/admin(?:\/.*)?$/, (req, res, next) => {
    if (HAS_EXTENSION.test(req.path)) {
      next()
      return
    }
    res.sendFile(adminIndex)
  })
}
