import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { env } from './config/env.js'
import { auditGuard } from './middleware/auditGuard.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { apiRouter } from './routes/index.js'
import { mountStatic } from './static.js'

export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')

  app.set('trust proxy', env.TRUST_PROXY)

  app.use(helmet())

  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  app.use(cors({ origin: allowedOrigins, credentials: true }))

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

  if (env.SERVE_STATIC) {
    mountStatic(app, env.STATIC_DIR)
  }

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
