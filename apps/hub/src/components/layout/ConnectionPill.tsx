import { RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useOffline } from '@/providers/OfflineProvider'
import { cn } from '@/lib/utils'

export function ConnectionPill({ className }: { className?: string }) {
  const { state, pending } = useOffline()

  const config = {
    online: { icon: Wifi, label: pending > 0 ? `Online — ${pending} queued` : 'Online', tone: 'bg-success-wash text-success border-success/30' },
    offline: { icon: WifiOff, label: pending > 0 ? `Offline — ${pending} queued` : 'Offline', tone: 'bg-warning-wash text-warning border-warning/30' },
    syncing: { icon: RefreshCw, label: `Syncing ${pending}`, tone: 'bg-info-wash text-info border-info/30' },
  }[state]

  const Icon = config.icon

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-label uppercase',
        config.tone,
        className,
      )}
    >
      <Icon size={14} className={cn('shrink-0', state === 'syncing' && 'animate-spin')} aria-hidden />
      {config.label}
    </span>
  )
}
