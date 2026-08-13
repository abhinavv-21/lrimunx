import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCircle2, Play, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CategoryBadge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { LogisticsRequest, RequestCategory, RequestStatus } from '@/types/api'

const BLOCKING: ReadonlySet<RequestCategory> = new Set<RequestCategory>(['PLACARD', 'LOGISTICS'])

export function isBlocking(request: LogisticsRequest): boolean {
  return BLOCKING.has(request.category) && request.status !== 'RESOLVED'
}

export function RequestCard({
  request,
  isAdmin,
  busy,
  onChangeStatus,
  onDelete,
}: {
  request: LogisticsRequest
  isAdmin: boolean
  busy: boolean
  onChangeStatus: (request: LogisticsRequest, next: RequestStatus) => void
  onDelete: (request: LogisticsRequest) => void
}) {
  const blocking = isBlocking(request)
  const age = formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })

  return (
    <article
      className={cn(
        'rounded-card border bg-surface p-4 transition-colors duration-micro md:p-5',
        blocking ? 'border-warning' : 'border-edge',
        request.status === 'RESOLVED' && 'opacity-75',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-h3 text-ink">{request.title}</h3>
            {blocking ? (
              <span className="inline-flex items-center gap-1 rounded-pill border border-warning/30 bg-warning-wash px-2 py-0.5 text-label uppercase text-warning">
                <AlertTriangle size={12} aria-hidden />
                Blocks session
              </span>
            ) : null}
          </div>

          <p className="mt-1.5 max-w-prose whitespace-pre-line text-body-sm text-ink-secondary">
            {request.description}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <CategoryBadge category={request.category} />
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-data text-ink-secondary">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Committee</dt>
          <dd className="font-medium text-ink">{request.committee?.code ?? 'General'}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Raised by</dt>
          <dd>{request.createdBy.fullName}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Raised</dt>
          <dd>{age}</dd>
        </div>
        {request.resolvedBy ? (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Resolved by</dt>
            <dd className="text-success">closed by {request.resolvedBy.fullName}</dd>
          </div>
        ) : null}
      </dl>

      {isAdmin ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-4">
          {request.status === 'OPEN' ? (
            <>
              <Button size="sm" loading={busy} onClick={() => onChangeStatus(request, 'IN_PROGRESS')}>
                <Play size={16} aria-hidden />
                Start work
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => onChangeStatus(request, 'RESOLVED')}>
                <CheckCircle2 size={16} aria-hidden />
                Done
              </Button>
            </>
          ) : null}

          {request.status === 'IN_PROGRESS' ? (
            <>
              <Button size="sm" loading={busy} onClick={() => onChangeStatus(request, 'RESOLVED')}>
                <CheckCircle2 size={16} aria-hidden />
                Mark resolved
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => onChangeStatus(request, 'OPEN')}>
                <Undo2 size={16} aria-hidden />
                Back to open
              </Button>
            </>
          ) : null}

          {request.status === 'RESOLVED' ? (
            <Button variant="secondary" size="sm" loading={busy} onClick={() => onChangeStatus(request, 'OPEN')}>
              <RotateCcw size={16} aria-hidden />
              Reopen
            </Button>
          ) : null}

          <Button variant="ghost" size="sm" className="ml-auto" disabled={busy} onClick={() => onDelete(request)}>
            <Trash2 size={16} aria-hidden />
            Delete
          </Button>
        </div>
      ) : null}
    </article>
  )
}
