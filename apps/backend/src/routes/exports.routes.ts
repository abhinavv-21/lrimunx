import { Router } from 'express'
import { AttendanceStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { auditRequest } from '../lib/audit.js'
import { fileNameFor, toPdf, toXlsx, type ExportTable } from '../lib/exporters.js'
import { asyncHandler, validate } from '../middleware/validate.js'
import { requireAdmin } from '../middleware/rbac.js'
import { exportQuery } from '../schemas/index.js'

export const exportsRouter = Router()

exportsRouter.use(requireAdmin)

type ExportRequest = {
  dataset: 'delegates' | 'logistics' | 'attendance'
  format: 'xlsx' | 'pdf'
  committeeId?: string
}

async function buildTable(request: ExportRequest): Promise<ExportTable> {
  switch (request.dataset) {
    case 'delegates': {
      const delegates = await prisma.delegate.findMany({
        where: request.committeeId ? { assignment: { is: { committeeId: request.committeeId } } } : {},
        orderBy: { fullName: 'asc' },
        include: { assignment: { include: { committee: { select: { code: true } } } } },
      })
      return {
        title: 'Delegates',
        columns: [
          'Full Name', 'School', 'Phone', 'Email', 'Grade', 'Committee Preference',
          'Committee', 'Country', 'Attendance', 'Dietary Notes', 'Accessibility Notes',
        ],
        rows: delegates.map((d) => [
          d.fullName, d.schoolName, d.phone, d.email, d.grade, d.committeePreference ?? '',
          d.assignment?.committee.code ?? '—', d.assignment?.country ?? '—',
          d.attendanceStatus === AttendanceStatus.CHECKED_IN ? 'Checked in' : 'Absent',
          d.dietaryNotes ?? '', d.accessibilityNotes ?? '',
        ]),
      }
    }

    case 'logistics': {
      const requests = await prisma.logisticsReq.findMany({
        where: request.committeeId ? { committeeId: request.committeeId } : {},
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          committee: { select: { code: true } },
          createdBy: { select: { fullName: true } },
          resolvedBy: { select: { fullName: true } },
        },
      })
      return {
        title: 'Logistics requests',
        columns: ['Title', 'Category', 'Committee', 'Status', 'Raised by', 'Resolved by', 'Raised at', 'Description'],
        rows: requests.map((r) => [
          r.title, r.category, r.committee?.code ?? 'General', r.status,
          r.createdBy.fullName, r.resolvedBy?.fullName ?? '—',
          r.createdAt.toISOString(), r.description,
        ]),
      }
    }

    case 'attendance': {
      const delegates = await prisma.delegate.findMany({
        where: request.committeeId ? { assignment: { is: { committeeId: request.committeeId } } } : {},
        orderBy: [{ attendanceStatus: 'asc' }, { fullName: 'asc' }],
        include: { assignment: { include: { committee: { select: { code: true } } } } },
      })
      return {
        title: 'Attendance',
        columns: ['Committee', 'Name', 'School', 'Contact number', 'Country', 'Status'],
        rows: [...delegates]
          .sort((a, b) => {
            const ca = a.assignment?.committee.code ?? '￿'
            const cb = b.assignment?.committee.code ?? '￿'
            return ca === cb ? a.fullName.localeCompare(b.fullName) : ca.localeCompare(cb)
          })
          .map((d) => [
            d.assignment?.committee.code ?? 'Unassigned', d.fullName, d.schoolName, d.phone,
            d.assignment?.country ?? '—',
            d.attendanceStatus === AttendanceStatus.CHECKED_IN ? 'Checked in' : 'Absent',
          ]),
      }
    }
  }
}

exportsRouter.get(
  '/',
  validate(exportQuery, 'query'),
  asyncHandler(async (req, res) => {
    const request = req.query as unknown as ExportRequest

    const table = await buildTable(request)
    const buffer = request.format === 'xlsx' ? toXlsx(table) : toPdf(table)
    const fileName = fileNameFor(request.dataset, request.format)

    await auditRequest(req, {
      action: 'EXPORT',
      entityType: request.dataset,
      entityId: request.committeeId ?? 'all',
      payloadAfter: { format: request.format, rows: table.rows.length, fileName },
    })

    res.setHeader(
      'Content-Type',
      request.format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf',
    )
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Content-Length', String(buffer.length))
    res.send(buffer)
  }),
)
