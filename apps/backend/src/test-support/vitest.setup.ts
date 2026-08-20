/**
 * Runs before every test file.
 *
 * Why this exists: the suite used to fail roughly one run in four, and not on an
 * assertion. Every test reported passing and then the worker died:
 *
 *   5157 Segmentation fault  "$NODE_EXE" "$NPX_CLI_JS" "$@"
 *
 * That is Prisma's native query engine being torn down by process exit rather
 * than being closed first. `src/lib/prisma.ts` caches one client on globalThis,
 * so every test file that imports anything touching the database shares it, but
 * only the integration suite ever disconnected it. Whichever file happened to
 * finish last left a live engine behind, and the crash was a race on shutdown.
 *
 * A green run that fails one time in four teaches people to press re-run instead
 * of reading the failure, which is worse than having no gate at all.
 */
import { afterAll } from 'vitest'

import { prisma } from '../lib/prisma.js'

afterAll(async () => {
  // Prisma reconnects lazily, so disconnecting between files is free.
  await prisma.$disconnect().catch(() => undefined)
})
