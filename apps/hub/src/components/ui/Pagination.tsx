import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

export interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void

  noun: string
}

export function Pagination({ page, pageSize, total, onPageChange, noun }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))

  if (total === 0 || pages <= 1) return null

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
      aria-label={`${noun} pages`}
    >

      <p className="text-body-sm text-ink-secondary" aria-live="polite">
        Showing <span className="font-medium text-ink">{first}–{last}</span> of{' '}
        <span className="font-medium text-ink">{total}</span> {noun}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden />
          Previous
        </Button>
        <span className="px-1 font-mono text-data tabular-nums text-ink-secondary">
          {page} / {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight size={16} aria-hidden />
        </Button>
      </div>
    </nav>
  )
}
