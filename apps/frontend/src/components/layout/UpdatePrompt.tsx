import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { BellRing, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/providers/AuthProvider'
import { pushSupported, subscribeToPush } from '@/lib/push'
import { cn } from '@/lib/utils'

/**
 * Two service-worker concerns surfaced as one unobtrusive panel:
 *  - a new build is waiting (registerType is 'prompt', so the user decides)
 *  - this device is not yet subscribed to alerts
 *
 * Both are offered, never forced, and only one shows at a time so the corner
 * of the screen never turns into a stack of competing cards.
 */
function Prompt({
  icon: Icon,
  title,
  body,
  dismissLabel,
  confirmLabel,
  onDismiss,
  onConfirm,
  busy = false,
}: {
  icon: typeof BellRing
  title: string
  body: string
  dismissLabel: string
  confirmLabel: string
  onDismiss: () => void
  onConfirm: () => void
  busy?: boolean
}) {
  return (
    <div
      role="status"
      className={cn(
        'fixed z-40 rounded-card border border-edge bg-surface shadow-overlay',
        'inset-x-4 bottom-[calc(theme(spacing.tabbar)+env(safe-area-inset-bottom)+16px)]',
        'md:inset-x-auto md:bottom-6 md:left-6 md:w-[360px]',
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-0">
        <span
          aria-hidden
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-control bg-accent-wash text-accent"
        >
          <Icon size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-heading text-h3 text-ink">{title}</p>
          <p className="mt-1 text-body-sm leading-relaxed text-ink-secondary">{body}</p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-control text-ink-tertiary transition-colors duration-micro hover:bg-surface-sunken hover:text-ink"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {/* Actions get their own row so the copy is never squeezed into a column. */}
      <div className="flex items-center justify-end gap-2 p-4 pt-3">
        <Button variant="ghost" size="sm" onClick={onDismiss} disabled={busy}>
          {dismissLabel}
        </Button>
        <Button size="sm" loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}

/**
 * "Not now" used to mean "not for the next few seconds".
 *
 * Dismissing only cleared component state, and the browser permission stays
 * `default` when you decline our card rather than the browser's own prompt — so
 * the offer came back on every reload, over the bottom of whatever screen you
 * were on. At a check-in desk, where the hub is reloaded all day, that is the
 * same interruption dozens of times for an answer already given.
 */
const PUSH_DECLINED_KEY = 'munx.pushDeclined'

export function UpdatePrompt() {
  const { user } = useAuth()
  const [pushOffered, setPushOffered] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)

  function declinePush() {
    try {
      localStorage.setItem(PUSH_DECLINED_KEY, '1')
    } catch {
      // Private mode or a full quota — the offer simply returns next time.
    }
    setPushOffered(false)
  }

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (error) => console.warn('[pwa] service worker registration failed', error),
  })

  useEffect(() => {
    if (!user || !pushSupported()) return
    // Only offer if the user has neither granted nor explicitly denied — and
    // has not already said no to this card.
    if (Notification.permission !== 'default') return
    let declined = false
    try {
      declined = localStorage.getItem(PUSH_DECLINED_KEY) === '1'
    } catch {
      declined = false
    }
    if (!declined) setPushOffered(true)
  }, [user])

  async function enablePush() {
    setPushBusy(true)
    try {
      await subscribeToPush()
    } catch (error) {
      console.warn('[push] subscription failed', error)
    } finally {
      setPushBusy(false)
      setPushOffered(false)
    }
  }

  // A waiting update matters more than an optional notification opt-in.
  if (needRefresh) {
    return (
      <Prompt
        icon={RefreshCw}
        title="Update available"
        body="A newer version of the hub is ready. Reload when you are at a natural stopping point."
        dismissLabel="Later"
        confirmLabel="Reload"
        onDismiss={() => setNeedRefresh(false)}
        onConfirm={() => void updateServiceWorker(true)}
      />
    )
  }

  if (pushOffered) {
    return (
      <Prompt
        icon={BellRing}
        title="Turn on alerts?"
        body="Get notified on this device when an urgent logistics request comes in."
        dismissLabel="Not now"
        confirmLabel="Enable"
        busy={pushBusy}
        onDismiss={declinePush}
        onConfirm={() => void enablePush()}
      />
    )
  }

  return null
}
