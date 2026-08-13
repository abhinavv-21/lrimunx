import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger'

const TONES: Record<CalloutTone, { box: string; icon: typeof Info }> = {
  info: { box: 'border-info bg-info-wash', icon: Info },
  success: { box: 'border-success bg-success-wash', icon: CheckCircle2 },
  warning: { box: 'border-warning bg-warning-wash', icon: TriangleAlert },
  danger: { box: 'border-danger bg-danger-wash', icon: AlertTriangle },
}

export interface CalloutProps {
  tone?: CalloutTone
  children: ReactNode

  alert?: boolean
  className?: string
}

export function Callout({ tone = 'info', children, alert = false, className }: CalloutProps) {
  const { box, icon: Icon } = TONES[tone]

  return (
    <div
      {...(alert ? { role: 'alert' as const } : {})}
      className={cn(
        'flex items-start gap-2.5 rounded-control border p-3 text-body-sm text-ink',
        box,
        className,
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
