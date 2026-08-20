import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { auditRequest } from '../lib/audit.js'
import { readTierPrices, writeTierPrices, type TierPrices } from '../lib/conference.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { requireOwner } from '../middleware/rbac.js'
import {
  SETTING_KEYS,
  updatePricingSchema,
  updateSettingsSchema,
  type SettingKey,
} from '../schemas/index.js'

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

/**
 * The four price tiers, in whole Nepali rupees.
 *
 * Kept apart from the key/value settings above rather than folded into them:
 * those are URLs and these are integers with their own bounds, and one endpoint
 * validating both would have to branch per key. Reading is open to any
 * signed-in account — the review queue shows the rate next to a payment — while
 * writing is the owner's, because a price is what the conference charges.
 */
settingsRouter.get(
  '/pricing',
  asyncHandler(async (_req, res) => {
    res.json(await readTierPrices())
  }),
)

settingsRouter.put(
  '/pricing',
  requireOwner,
  validate(updatePricingSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<TierPrices>

    const before = await readTierPrices()
    await writeTierPrices(body)
    const after = await readTierPrices()

    await auditRequest(req, {
      action: 'UPDATE',
      entityType: 'Pricing',
      entityId: Object.keys(body).join(','),
      payloadBefore: before,
      payloadAfter: after,
    })

    res.json(after)
  }),
)

settingsRouter.put(
  '/',
  requireOwner,
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
