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
 * Why the import is dynamic
 * -------------------------
 * Vercel compiles this file to CommonJS, and `apps/backend/dist` is ESM. A
 * static import becomes a `require()` and dies at runtime with:
 *
 *   ERR_REQUIRE_ESM: require() of ES Module .../dist/app.js is not supported
 *
 * `await import()` works from CommonJS, so the bridge is one dynamic import
 * resolved once and cached. Do not "tidy" this into a top-level import.
 *
 * Two other things behave differently here and are worth knowing:
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

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void

// Module scope, so a warm invocation reuses the app rather than rebuilding the
// router and reconnecting on every request.
let appPromise: Promise<NodeHandler> | null = null

async function loadApp(): Promise<NodeHandler> {
  const [{ createApp }, { initialisePush }] = await Promise.all([
    import('../apps/backend/dist/app.js'),
    import('../apps/backend/dist/lib/push.js'),
  ])

  initialisePush()
  return createApp() as unknown as NodeHandler
}

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    appPromise ??= loadApp()
    const app = await appPromise
    app(req, res)
  } catch (error) {
    // A failure here is configuration, not traffic: a missing environment
    // variable, or a build that did not produce apps/backend/dist. Say so,
    // because the alternative is Vercel's opaque FUNCTION_INVOCATION_FAILED.
    appPromise = null

    console.error('[api] failed to start:', error)
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        error: 'The API failed to start. Check the deployment logs and the environment variables.',
        code: 500,
      }),
    )
  }
}
