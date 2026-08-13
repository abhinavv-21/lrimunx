import { Router, type NextFunction, type Request, type Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'
import { ApiError } from '../lib/errors.js'
import { recordAudit } from '../lib/audit.js'
import { ingestDelegates, parseCsv } from '../lib/ingestion.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser, requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import { csvImportSchema, sheetsWebhookSchema } from '../schemas/index.js'
import { prisma } from '../lib/prisma.js'

export const integrationsRouter = Router()

function requireWebhookSecret(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.header('X-Webhook-Secret')
  if (!provided) {
    next(ApiError.unauthorized('Missing X-Webhook-Secret header'))
    return
  }

  const a = Buffer.from(provided)
  const b = Buffer.from(env.GOOGLE_SHEETS_WEBHOOK_SECRET)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    next(ApiError.unauthorized('Invalid webhook secret'))
    return
  }

  next()
}

integrationsRouter.post(
  '/google-sheets',
  requireWebhookSecret,
  validate(sheetsWebhookSchema),
  asyncHandler(async (req, res) => {
    const { rows, upsert } = req.body as { rows: unknown[]; upsert: boolean }

    const result = await ingestDelegates(rows, upsert)

    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true }, orderBy: { createdAt: 'asc' } })
    if (admin) {
      await recordAudit({
        userId: admin.id,
        action: 'IMPORT',
        entityType: 'Delegate',
        entityId: `google-sheets:${rows.length}`,
        payloadAfter: {
          source: 'google-sheets',
          received: rows.length,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
        },
      })
    }

    res.status(result.issues.length > 0 ? 207 : 200).json(result)
  }),
)

integrationsRouter.post(
  '/csv',
  requireAuth,
  requireAdmin,
  validate(csvImportSchema),
  asyncHandler(async (req, res) => {
    const { csv, upsert } = req.body as { csv: string; upsert: boolean }
    const actor = currentUser(req)

    const rows = parseCsv(csv)
    if (rows.length === 0) throw ApiError.badRequest('CSV contained no data rows')

    const result = await ingestDelegates(rows, upsert)

    await recordAudit({
      userId: actor.id,
      action: 'IMPORT',
      entityType: 'Delegate',
      entityId: `csv:${rows.length}`,
      payloadAfter: {
        source: 'csv',
        received: rows.length,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
      },
    })
    req.auditWritten = true

    res.status(result.issues.length > 0 ? 207 : 200).json(result)
  }),
)
