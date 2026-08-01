/**
 * Vercel serverless entry for the whole API.
 *
 * `vercel.json` rewrites every /api/* request here, and the Express app then
 * routes it exactly as it does locally — the same `createApp()` serves both, so
 * there is no second routing table to keep in step.
 *
 * This imports the COMPILED backend rather than its TypeScript source. The
 * backend is an ESM package whose internal imports carry explicit `.js`
 * extensions; handing that to Vercel's function bundler as source means asking
 * it to resolve a module graph written for `tsc`. Building first is one extra
 * step in `vercel-build` and removes the whole class of problem.
 */
import app from '../apps/backend/dist/serverless.js'

export default app
