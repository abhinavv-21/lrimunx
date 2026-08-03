import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
/*
  The ESM build, explicitly.

  jspdf-autotable's default entry point is a UMD bundle. Under the native ESM
  this server actually runs on, `import autoTable from 'jspdf-autotable'` binds
  the CommonJS `module.exports` OBJECT rather than the function — the callable
  ends up at `.default.default` — so every PDF export threw "autoTable is not a
  function" and came back as a 500.

  It passed its unit test throughout: Vitest transforms the dependency itself
  and hands back the interop shape TypeScript predicts, so the bug was only
  ever reachable through the running API. The `./es` subpath is the same
  library's .mjs build, and exports the function as a real ESM default.
*/
import autoTable from 'jspdf-autotable/es'

export interface ExportTable {
  title: string
  columns: string[]
  rows: Array<Array<string | number>>
}

export function toXlsx(table: ExportTable): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet([table.columns, ...table.rows])

  // Size each column to its widest cell so the sheet is readable on open.
  worksheet['!cols'] = table.columns.map((column, index) => {
    const longest = table.rows.reduce((max, row) => {
      const cell = row[index]
      return Math.max(max, cell === undefined || cell === null ? 0 : String(cell).length)
    }, column.length)
    return { wch: Math.min(Math.max(longest + 2, 10), 60) }
  })
  worksheet['!freeze'] = { xSplit: '0', ySplit: '1' }

  const workbook = XLSX.utils.book_new()
  // Excel rejects sheet names over 31 characters.
  XLSX.utils.book_append_sheet(workbook, worksheet, table.title.slice(0, 31))

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export function toPdf(table: ExportTable): Buffer {
  // Landscape: these tables are wide and get unreadable in portrait.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })

  doc.setFontSize(16)
  doc.text('LRI MUN X Operations Hub', 40, 40)
  doc.setFontSize(11)
  doc.setTextColor(71, 85, 105)
  doc.text(table.title, 40, 58)
  doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, 40, 74)

  autoTable(doc, {
    head: [table.columns],
    body: table.rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell)))),
    startY: 92,
    styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
    // Magenta #B41884, matching DESIGN.md.
    headStyles: { fillColor: [180, 24, 132], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages()
      const pageSize = doc.internal.pageSize
      doc.setFontSize(8)
      doc.setTextColor(148, 163, 184)
      doc.text(
        `Page ${doc.getCurrentPageInfo().pageNumber} of ${pageCount}`,
        pageSize.getWidth() - 40,
        pageSize.getHeight() - 20,
        { align: 'right' },
      )
    },
  })

  return Buffer.from(doc.output('arraybuffer'))
}

export function fileNameFor(dataset: string, format: 'xlsx' | 'pdf'): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `lri-mun-x-${dataset}-${stamp}.${format}`
}
