import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { auditRequest } from '../lib/audit.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { requireAdmin } from '../middleware/rbac.js'
import { SETTING_KEYS, updateSettingsSchema, type SettingKey } from '../schemas/index.js'

export const settingsRouter = Router()

type Settings = Record<SettingKey, string>

function emptySettings(): Settings {
  return Object.fromEntries(SETTING_KEYS.map((key) => [key, ''])) as Settings
}

async function readSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } })
  const settings = emptySettings()
  for (const row of rows) {
    settings[row.key as SettingKey] = row.value
  }
  return settings
}

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await readSettings())
  }),
)

settingsRouter.put(
  '/',
  requireAdmin,
  validate(updateSettingsSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<Settings>
    const before = await readSettings()

    for (const [key, value] of Object.entries(body)) {
      if (!SETTING_KEYS.includes(key as SettingKey)) continue

      if (value === '') {
        await prisma.setting.deleteMany({ where: { key } })
        continue
      }
      await prisma.setting.upsert({
        where: { key },
        update: { value: value as string },
        create: { key, value: value as string },
      })
    }

    const after = await readSettings()

    await auditRequest(req, {
      action: 'UPDATE',
      entityType: 'Setting',
      entityId: Object.keys(body).join(','),
      payloadBefore: before,
      payloadAfter: after,
    })

    res.json(after)
  }),
)
