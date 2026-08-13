import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface DataTableProps<T> {
  data: T[]
  columns: Array<ColumnDef<T, unknown>>

  getRowId: (row: T) => string

  mobileTitle: (row: T) => ReactNode

  mobileSubtitle?: (row: T) => ReactNode
  onRowClick?: (row: T) => void
  selectedId?: string | null
  emptyState: ReactNode
  caption: string
}

export function DataTable<T>({
  data,
  columns,
  getRowId,
  mobileTitle,
  mobileSubtitle,
  onRowClick,
  selectedId,
  emptyState,
  caption,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
  })

  if (data.length === 0) return <>{emptyState}</>

  const rows = table.getRowModel().rows

  return (
    <>

      <div className="table-scroll hidden rounded-card border border-edge bg-surface md:block">
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-surface-sunken">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className={cn(
                      'border-b border-edge px-4 py-3 text-left text-label uppercase text-ink-secondary',
                      header.column.columnDef.meta?.align === 'right' && 'text-right',
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = selectedId === row.id
              return (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'h-row border-b border-edge last:border-b-0',
                    'transition-colors duration-micro ease-out',
                    onRowClick && 'cursor-pointer',
                    isSelected ? 'bg-accent-wash shadow-[inset_3px_0_0_0_theme(colors.accent.DEFAULT)]' : 'hover:bg-accent-wash',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-4 py-2 align-middle text-ink',
                        cell.column.columnDef.meta?.align === 'right' && 'text-right',
                        cell.column.columnDef.meta?.mono && 'font-mono text-data tabular-nums',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => {
          const isSelected = selectedId === row.id
          const Wrapper = onRowClick ? 'button' : 'div'

          return (
            <li key={row.id}>
              <Wrapper
                {...(onRowClick
                  ? { type: 'button' as const, onClick: () => onRowClick(row.original) }
                  : {})}
                className={cn(
                  'w-full rounded-card border bg-surface p-4 text-left',
                  'transition-colors duration-micro ease-out',
                  isSelected ? 'border-accent bg-accent-wash' : 'border-edge',
                )}
              >
                <p className="font-heading text-h3 text-ink">{mobileTitle(row.original)}</p>
                {mobileSubtitle ? (
                  <p className="mt-0.5 text-body-sm text-ink-secondary">{mobileSubtitle(row.original)}</p>
                ) : null}

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                  {row.getVisibleCells().map((cell) => {
                    if (cell.column.columnDef.meta?.hideOnMobile) return null
                    const header = cell.column.columnDef.header
                    return (
                      <div key={cell.id} className="min-w-0">
                        <dt className="text-label uppercase text-ink-secondary">
                          {typeof header === 'string' ? header : cell.column.id}
                        </dt>
                        <dd
                          className={cn(
                            'mt-1 text-body-sm text-ink',
                            cell.column.columnDef.meta?.mono && 'font-mono text-data tabular-nums',
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </Wrapper>
            </li>
          )
        })}
      </ul>
    </>
  )
}
