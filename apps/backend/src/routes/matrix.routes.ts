/**
 * The country matrix — which countries sit in which committee.
 *
 * Reading is open to both roles: a contributor at the desk needs to answer
 * "is Brazil in DISEC?" without an admin. Writing is ADMIN-only and audited,
 * because the matrix is what the allocation screen validates against — editing
 * it changes what every future allocation is allowed to be.
 */
import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { recordAudit } from '../lib/audit.js'
import { runSerializable } from '../lib/transaction.js'
import { parseMatrixCsv, type MatrixIssue } from '../lib/matrix.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { currentUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import { matrixImportSchema, matrixCountrySchema, uuidParam } from '../schemas/index.js'

export const matrixRouter = Router()

/* ---------------------------------- Read ---------------------------------- */

/**
 * GET /api/v1/matrix
 *
 * Every committee with its matrix, and who currently holds each country.
 *
 * Committees with no matrix are still listed. An empty list is the signal that
 * a committee is unconstrained, and hiding it would make "not imported yet"
 * indistinguishable from "does not exist".
 */
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
        /**
         * Allocated to a country that is NOT on the matrix.
         *
         * Only meaningful once the committee HAS a matrix. With no rows every
         * country is unconstrained and therefore accepted — but this listed
         * every assignment anyway, so an unconstrained committee showed a
         * warning naming its own delegates and telling the operator to add the
         * country or move them, directly under the line saying any country is
         * accepted. Nothing was wrong and there was nothing to fix.
         */
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

/* --------------------------------- Writes --------------------------------- */
// ADMIN-only from here down.

/**
 * POST /api/v1/matrix/import
 *
 * Take a spreadsheet and make it the matrix.
 *
 * `mode` decides what happens to what is already there:
 *
 *   merge   — add anything new, leave the rest alone. The safe default, and
 *             what you want when adding a committee to an existing matrix.
 *   replace — the sheet becomes the whole matrix for the committees it names.
 *             Committees it does NOT name are untouched, so re-importing one
 *             corrected column cannot silently empty the other five.
 *
 * A country currently allocated to a delegate is never removed, in either
 * mode. Dropping it would leave that delegate holding a country the committee
 * no longer contains — the exact state this table exists to prevent — so it is
 * kept and reported instead.
 */
matrixRouter.post(
  '/import',
  requireAdmin,
  validate(matrixImportSchema),
  asyncHandler(async (req, res) => {
    const { csv, mode } = req.body as { csv: string; mode: 'merge' | 'replace' }
    const actor = currentUser(req)

    const parsed = parseMatrixCsv(csv)

    // Refused before a single row is written — see the quote-error note in
    // parseMatrixCsv for why this one class of problem cannot be partial.
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

    /*
      Which heading already claimed each committee.

      A committee is addressable by its code OR its name, so two different
      headings can resolve to the same room — "WHO" and "World Health
      Organization" are one committee, and the duplicate-heading check in the
      parser cannot see that because the two strings are genuinely different.

      In `replace` mode that was silent data loss: the first column set the
      matrix, and the second replaced it, deleting everything the first had
      just written. The second column is refused and reported instead.
    */
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

      // One transaction per committee: a bad column reports and skips rather
      // than rolling back the columns that were fine.
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

    await recordAudit({
      userId: actor.id,
      action: 'IMPORT',
      entityType: 'CommitteeCountry',
      entityId: `matrix:${touched.join(',') || 'none'}`,
      payloadBefore: null,
      payloadAfter: { mode, committees: touched, added, removed, unchanged, issues: issues.length },
    })

    res.json({ mode, committees: touched, added, removed, unchanged, kept, issues, longForm: parsed.longForm })
  }),
)

/** POST /api/v1/matrix — add one country by hand, for the inevitable late addition. */
matrixRouter.post(
  '/',
  requireAdmin,
  validate(matrixCountrySchema),
  asyncHandler(async (req, res) => {
    const { committeeId, country } = req.body as { committeeId: string; country: string }
    const actor = currentUser(req)

    const committee = await prisma.committee.findUnique({ where: { id: committeeId }, select: { code: true } })
    if (!committee) throw ApiError.notFound('Committee not found')

    try {
      const created = await prisma.committeeCountry.create({
        data: { committeeId, country },
        select: { id: true, country: true },
      })
      await recordAudit({
        userId: actor.id,
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

/**
 * DELETE /api/v1/matrix/:id
 *
 * Refused while a delegate holds the country. Removing it would strand them on
 * a country their committee no longer has — unallocate them first, which is a
 * deliberate decision rather than a side effect of tidying a list.
 */
matrixRouter.delete(
  '/:id',
  requireAdmin,
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string }
    const actor = currentUser(req)

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
    await recordAudit({
      userId: actor.id,
      action: 'DELETE',
      entityType: 'CommitteeCountry',
      entityId: id,
      payloadBefore: { committee: row.committee.code, country: row.country },
      payloadAfter: null,
    })

    res.status(204).end()
  }),
)
