import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCircle2, Flame, Play, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CategoryBadge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { PRIORITY_LABEL } from './priority'
import type { LogisticsRequest, PriorityLevel, RequestCategory, RequestStatus } from '@/types/api'

const BLOCKING: ReadonlySet<RequestCategory> = new Set<RequestCategory>(['PLACARD', 'LOGISTICS'])

export function isBlocking(request: LogisticsRequest): boolean {
  return BLOCKING.has(request.category) && request.status !== 'RESOLVED'
}

/**
 * Four tones, not four shades of one. Critical and high are the two a runner
 * needs to spot from across a room, so they take the loud colours; normal and
 * low sit back on the neutral so they cannot compete with them.
 */
const LEVEL_TONE: Record<PriorityLevel, string> = {
  CRITICAL: 'border-danger/40 bg-danger-wash text-danger',
  HIGH: 'border-warning/40 bg-warning-wash text-warning',
  NORMAL: 'border-edge-strong bg-surface-sunken text-ink-secondary',
  LOW: 'border-edge bg-surface-sunken text-ink-tertiary',
}

function PriorityChip({ level }: { level: PriorityLevel }) {
  const loud = level === 'CRITICAL' || level === 'HIGH'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-pill border px-2 py-0.5 text-label uppercase',
        LEVEL_TONE[level],
      )}
    >
      {loud ? <Flame size={12} aria-hidden /> : null}
      {PRIORITY_LABEL[level]} priority
    </span>
  )
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
  const level = request.priorityLevel
  const age = formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })

  // A card the desk should look at now. The server's own ranking decides that
  // where it gave one; the committee page fetches requests without a score, so
  // there the blocking categories still stand in for it.
  const urgent = level !== undefined ? level === 'CRITICAL' || level === 'HIGH' : blocking

  return (
    <article
      className={cn(
        'rounded-card border bg-surface p-4 transition-colors duration-micro md:p-5',
        level === 'CRITICAL' ? 'border-danger' : urgent ? 'border-warning' : 'border-edge',
        request.status === 'RESOLVED' && 'opacity-75',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-h3 text-ink">{request.title}</h3>
            {level !== undefined ? (
              <PriorityChip level={level} />
            ) : blocking ? (
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
        {request.day != null ? (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Conference day</dt>
            <dd className="font-medium text-ink">Day {request.day}</dd>
          </div>
        ) : null}
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
