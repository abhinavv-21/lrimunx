import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { env } from './config/env.js'
import { auditGuard } from './middleware/auditGuard.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { apiRouter } from './routes/index.js'

export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  // Zero unless a proxy is actually configured — see TRUST_PROXY in config/env.
  app.set('trust proxy', env.TRUST_PROXY)

  app.use(helmet())
  /*
    Trailing slashes are stripped, because pasting one in is the easy mistake
    and it fails silently.

    An Origin header is scheme + host + port and never carries a path, so
    `https://site.example/` matches nothing a browser will ever send. Copying a
    URL out of the address bar — which is where anybody configuring this gets
    it — includes that slash. The result is not an error anywhere: the API
    starts, answers, and simply omits the CORS header, so the site loads and
    every request from it is blocked by the browser with nothing in the server
    log to explain why. Being forgiving here costs nothing and removes a whole
    class of "it deployed fine and registration is broken".
  */
  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  app.use(cors({ origin: allowedOrigins, credentials: true }))

  // The Google Sheets webhook can post sizeable batches; everything else is small.
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true, limit: '2mb' }))

  app.use(auditGuard)

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'lri-mun-x-operations-hub', time: new Date().toISOString() })
  })

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests, slow down', code: 429 },
  })

  app.use('/api/v1', apiLimiter, apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
