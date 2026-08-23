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
  const editionsPage = path.join(root, 'editions.html')
  const privacyPage = path.join(root, 'privacy.html')
  const colophonPage = path.join(root, 'colophon.html')
  const notFoundPage = path.join(root, '404.html')
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

  app.get('/editions', (_req, res) => {
    res.sendFile(editionsPage)
  })

  app.get('/privacy', (_req, res) => {
    res.sendFile(privacyPage)
  })

  app.get('/colophon', (_req, res) => {
    res.sendFile(colophonPage)
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

  /**
   * A browser asking for a page that is not here gets the 404 page. Everything
   * else falls through to notFoundHandler and its JSON body.
   *
   * Without this the JSON handler answered every miss, so a mistyped URL on
   * this deployment rendered {"error":"No route for GET /whatever"} as the
   * page. Vercel serves dist/404.html for the same case on its own.
   */
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    if (req.path.startsWith('/api/')) {
      next()
      return
    }
    if (!req.accepts('html')) {
      next()
      return
    }
    res.status(404).sendFile(notFoundPage)
  })
}
