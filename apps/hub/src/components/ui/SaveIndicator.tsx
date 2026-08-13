import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function SaveIndicator({ state, className }: { state: SaveState; className?: string }) {
  if (state === 'saving') {
    return (
      <span className={cn('flex items-center gap-1.5 text-body-sm text-ink-secondary', className)}>
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Saving
      </span>
    )
  }

  if (state === 'saved') {
    return (
      <span className={cn('flex items-center gap-1.5 text-body-sm text-success', className)}>
        <Check size={14} aria-hidden />
        Saved
      </span>
    )
  }

  if (state === 'error') {
    return (
      <span className={cn('flex items-center gap-1.5 text-body-sm text-danger', className)}>
        <AlertTriangle size={14} aria-hidden />
        Not saved
      </span>
    )
  }

  return null
}
