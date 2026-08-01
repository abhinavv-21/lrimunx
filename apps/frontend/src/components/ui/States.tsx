import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Lock, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from './Button'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Skeleton rows match the final row height so data landing never shifts the
 * layout. DESIGN.md forbids a centred spinner for table content.
 */
export function SkeletonRows({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex h-row-mobile items-center gap-4 border-b border-edge px-4 md:h-row"
        >
          {Array.from({ length: columns }, (_, columnIndex) => (
            <div
              key={columnIndex}
              className="skeleton h-3.5"
              style={{ width: columnIndex === 0 ? '28%' : `${Math.max(12, 20 - columnIndex * 2)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-card border border-edge bg-surface p-5">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-3 h-9 w-16" />
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Empty                                                                       */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <Icon size={32} className="text-ink-tertiary" aria-hidden />
      <h3 className="mt-4 text-h3 text-ink">{title}</h3>
      <p className="mt-1 max-w-prose text-body-sm text-ink-secondary">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Error                                                                       */
/* -------------------------------------------------------------------------- */

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiError && error.isOffline
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'The request failed for an unknown reason.'

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-card border border-danger bg-danger-wash p-5 sm:flex-row sm:items-center"
    >
      {offline ? (
        <WifiOff size={20} className="shrink-0 text-danger" aria-hidden />
      ) : (
        <AlertTriangle size={20} className="shrink-0 text-danger" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-h3 text-ink">{offline ? 'No connection' : 'Could not load this'}</p>
        <p className="mt-1 text-body-sm text-ink-secondary">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden />
          Retry
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Shown where a whole surface is out of the current role's scope.
 * Individual admin controls are omitted rather than disabled — this is only
 * for a full page. Server-side RBAC remains the real boundary.
 */
export function PermissionDenied({ what }: { what: string }) {
  return (
    <EmptyState
      icon={Lock}
      title="Not available on your account"
      description={`${what} is managed by the secretariat. Ask an admin if you need access.`}
    />
  )
}
