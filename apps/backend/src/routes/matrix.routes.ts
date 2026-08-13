import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { auditRequest } from '../lib/audit.js'
import { runSerializable } from '../lib/transaction.js'
import { parseMatrixCsv, type MatrixIssue } from '../lib/matrix.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { requireAdmin } from '../middleware/rbac.js'
import { matrixImportSchema, matrixCountrySchema, uuidParam } from '../schemas/index.js'

export const matrixRouter = Router()

matrixRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const committees = await prisma.committee.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        totalSeats: true,
        countries: { orderBy: { country: 'asc' }, select: { id: true, country: true } },
        assignments: {
          select: { country: true, delegate: { select: { id: true, fullName: true } } },
        },
      },
    })

    const items = committees.map(({ countries, assignments, ...committee }) => {
      const held = new Map(assignments.map((a) => [a.country, a.delegate]))

      return {
        ...committee,
        offMatrix:
          countries.length === 0
            ? []
            : assignments
                .filter((a) => !countries.some((c) => c.country === a.country))
                .map((a) => ({
                  country: a.country,
                  delegateId: a.delegate.id,
                  delegateName: a.delegate.fullName,
                })),
        countries: countries.map((c) => {
          const holder = held.get(c.country)
          return {
            id: c.id,
            country: c.country,
            delegateId: holder?.id ?? null,
            delegateName: holder?.fullName ?? null,
          }
        }),
      }
    })

    res.json({ items })
  }),
)

matrixRouter.post(
  '/import',
  requireAdmin,
  validate(matrixImportSchema),
  asyncHandler(async (req, res) => {
    const { csv, mode } = req.body as { csv: string; mode: 'merge' | 'replace' }

    const parsed = parseMatrixCsv(csv)

    if (parsed.fatal) {
      throw ApiError.unprocessable(parsed.fatal, { issues: parsed.issues })
    }

    const issues: MatrixIssue[] = [...parsed.issues]

    const committees = await prisma.committee.findMany({ select: { id: true, code: true, name: true } })
    const byKey = new Map<string, { id: string; code: string }>()
    committees.forEach((c) => {
      byKey.set(c.code.toLowerCase(), c)
      byKey.set(c.name.toLowerCase(), c)
    })

    let added = 0
    let removed = 0
    let unchanged = 0
    const touched: string[] = []
    const kept: Array<{ committee: string; country: string; delegateName: string }> = []

    const claimedBy = new Map<string, string>()

    for (const column of parsed.columns) {
      const committee = byKey.get(column.committee.toLowerCase())
      if (committee) {
        const first = claimedBy.get(committee.id)
        if (first !== undefined) {
          issues.push({
            row: 1,
            column: column.committee,
            reason: `"${column.committee}" and "${first}" are both ${committee.code}. Only "${first}" was used — merge them into one column.`,
          })
          continue
        }
        claimedBy.set(committee.id, column.committee)
      }
      if (!committee) {
        issues.push({
          row: 1,
          column: column.committee,
          reason: `No committee matches "${column.committee}". Create it first — importing cannot invent a seat count.`,
        })
        continue
      }
      if (column.countries.length === 0) {
        issues.push({ row: 1, column: column.committee, reason: 'This column has no countries in it.' })
        continue
      }

      await runSerializable(async (tx) => {
        const existing = await tx.committeeCountry.findMany({
          where: { committeeId: committee.id },
          select: { id: true, country: true },
        })
        const have = new Map(existing.map((row) => [row.country, row.id]))
        const want = new Set(column.countries)

        for (const country of column.countries) {
          if (have.has(country)) {
            unchanged++
            continue
          }
          await tx.committeeCountry.create({ data: { committeeId: committee.id, country } })
          added++
        }

        if (mode === 'replace') {
          const doomed = existing.filter((row) => !want.has(row.country))
          if (doomed.length > 0) {
            const allocated = await tx.assignment.findMany({
              where: { committeeId: committee.id, country: { in: doomed.map((d) => d.country) } },
              select: { country: true, delegate: { select: { fullName: true } } },
            })
            const spokenFor = new Set(allocated.map((a) => a.country))
            allocated.forEach((a) =>
              kept.push({ committee: committee.code, country: a.country, delegateName: a.delegate.fullName }),
            )

            const removable = doomed.filter((d) => !spokenFor.has(d.country))
            if (removable.length > 0) {
              await tx.committeeCountry.deleteMany({ where: { id: { in: removable.map((d) => d.id) } } })
              removed += removable.length
            }
          }
        }
      })

      touched.push(committee.code)
    }

    await auditRequest(req, {
      action: 'IMPORT',
      entityType: 'CommitteeCountry',
      entityId: `matrix:${touched.join(',') || 'none'}`,
      payloadBefore: null,
      payloadAfter: { mode, committees: touched, added, removed, unchanged, issues: issues.length },
    })

    res.json({ mode, committees: touched, added, removed, unchanged, kept, issues, longForm: parsed.longForm })
  }),
)

matrixRouter.post(
  '/',
  requireAdmin,
  validate(matrixCountrySchema),
  asyncHandler(async (req, res) => {
    const { committeeId, country } = req.body as { committeeId: string; country: string }

    const committee = await prisma.committee.findUnique({ where: { id: committeeId }, select: { code: true } })
    if (!committee) throw ApiError.notFound('Committee not found')

    try {
      const created = await prisma.committeeCountry.create({
        data: { committeeId, country },
        select: { id: true, country: true },
      })
      await auditRequest(req, {
        action: 'CREATE',
        entityType: 'CommitteeCountry',
        entityId: created.id,
        payloadBefore: null,
        payloadAfter: { committee: committee.code, country: created.country },
      })
      res.status(201).json(created)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw ApiError.conflict(`${country} is already on ${committee.code}'s matrix`)
      }
      throw error
    }
  }),
)

matrixRouter.delete(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }

    const row = await prisma.committeeCountry.findUnique({
      where: { id },
      select: { id: true, country: true, committeeId: true, committee: { select: { code: true } } },
    })
    if (!row) throw ApiError.notFound('That country is not on any matrix')

    const holder = await prisma.assignment.findFirst({
      where: { committeeId: row.committeeId, country: row.country },
      select: { delegate: { select: { fullName: true } } },
    })
    if (holder) {
      throw ApiError.conflict(
        `${row.country} is allocated to ${holder.delegate.fullName}. Unallocate them before removing it.`,
      )
    }

    await prisma.committeeCountry.delete({ where: { id } })
    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'CommitteeCountry',
      entityId: id,
      payloadBefore: { committee: row.committee.code, country: row.country },
      payloadAfter: null,
    })

    res.status(204).end()
  }),
)
