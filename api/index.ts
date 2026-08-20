/**
 * Vercel serverless entry point.
 *
 * The same Express app that runs as one long-lived process on Oracle, wrapped
 * as a function. `apps/backend/src/index.ts` is the standalone server: it calls
 * `createApp()` and then `listen()`. Vercel supplies the listener, so this file
 * calls `createApp()` and nothing else.
 *
 * Oracle stays the real deployment. This exists so branch previews and the test
 * environment have somewhere reliable to live until that VM is up.
 *
 * Two things behave differently here and are worth knowing:
 *
 * 1. There is no process to keep warm. Every cold start opens a new PostgreSQL
 *    connection, so DATABASE_URL must point at a pooled endpoint and carry
 *    `connection_limit=1`. Without that, a burst of requests exhausts the
 *    database's connection limit rather than queueing.
 *
 * 2. `SERVE_STATIC` must be false. Vercel serves the built site and hub from
 *    dist/ as static files; the API only handles /api/v1 and /health.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import { createApp } from '../apps/backend/dist/app.js'
import { initialisePush } from '../apps/backend/dist/lib/push.js'

// Module scope, so a warm invocation reuses the app rather than rebuilding the
// router on every request.
let handler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null

function app() {
  if (!handler) {
    initialisePush()
    handler = createApp() as unknown as (req: IncomingMessage, res: ServerResponse) => void
  }
  return handler
}

export default function vercelHandler(req: IncomingMessage, res: ServerResponse): void {
  app()(req, res)
}
