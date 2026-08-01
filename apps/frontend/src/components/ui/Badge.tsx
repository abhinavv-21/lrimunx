import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle, CheckCircle2, CircleDashed, CircleDot, LoaderCircle, UserCheck, UserX,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AttendanceStatus, RequestCategory, RequestStatus, Role } from '@/types/api'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TONES: Record<Tone, string> = {
  success: 'bg-success-wash text-success border-success/30',
  warning: 'bg-warning-wash text-warning border-warning/30',
  danger: 'bg-danger-wash text-danger border-danger/30',
  info: 'bg-info-wash text-info border-info/30',
  neutral: 'bg-surface-sunken text-ink-secondary border-edge-strong',
}

interface BadgeProps {
  tone: Tone
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
}

/**
 * DESIGN.md: status is never colour alone. Every badge renders an icon and a
 * text label so it survives greyscale, colour blindness and a bright corridor.
 */
export function Badge({ tone, icon: Icon, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1',
        'text-label uppercase',
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon size={14} className="shrink-0" aria-hidden /> : null}
      {children}
    </span>
  )
}

const ATTENDANCE: Record<AttendanceStatus, { tone: Tone; icon: BadgeProps['icon']; label: string }> = {
  CHECKED_IN: { tone: 'success', icon: UserCheck, label: 'Checked in' },
  ABSENT: { tone: 'neutral', icon: UserX, label: 'Absent' },
}

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const config = ATTENDANCE[status]
  return <Badge tone={config.tone} icon={config.icon}>{config.label}</Badge>
}

const REQUEST: Record<RequestStatus, { tone: Tone; icon: BadgeProps['icon']; label: string }> = {
  OPEN: { tone: 'warning', icon: CircleDot, label: 'Open' },
  IN_PROGRESS: { tone: 'info', icon: LoaderCircle, label: 'In progress' },
  RESOLVED: { tone: 'success', icon: CheckCircle2, label: 'Resolved' },
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const config = REQUEST[status]
  return <Badge tone={config.tone} icon={config.icon}>{config.label}</Badge>
}

const CATEGORY_LABEL: Record<RequestCategory, string> = {
  PLACARD: 'Placard',
  STATIONERY: 'Stationery',
  AWARDS: 'Awards',
  LOGISTICS: 'Logistics',
}

export function CategoryBadge({ category }: { category: RequestCategory }) {
  // Category is not a status, so it stays neutral — only status carries colour.
  return <Badge tone="neutral" icon={CircleDashed}>{CATEGORY_LABEL[category]}</Badge>
}

export function RoleBadge({ role }: { role: Role }) {
  return role === 'ADMIN'
    ? <Badge tone="info" icon={CheckCircle2}>Admin</Badge>
    : <Badge tone="neutral" icon={CircleDot}>Contributor</Badge>
}

export function QueuedBadge() {
  return <Badge tone="warning" icon={AlertTriangle}>Queued</Badge>
}
