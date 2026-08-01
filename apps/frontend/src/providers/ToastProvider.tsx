import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import * as Toast from '@radix-ui/react-toast'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'danger' | 'info'

interface ToastMessage {
  id: number
  tone: ToastTone
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

interface ToastContextValue {
  notify: (message: Omit<ToastMessage, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONE_STYLES: Record<ToastTone, { wrapper: string; icon: typeof Info }> = {
  success: { wrapper: 'border-success bg-success-wash text-success', icon: CheckCircle2 },
  danger: { wrapper: 'border-danger bg-danger-wash text-danger', icon: AlertTriangle },
  info: { wrapper: 'border-info bg-info-wash text-info', icon: Info },
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  const notify = useCallback((message: Omit<ToastMessage, 'id'>) => {
    setMessages((current) => [...current, { ...message, id: nextId++ }])
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (title, description) => notify({ tone: 'success', title, ...(description ? { description } : {}) }),
      error: (title, description) => notify({ tone: 'danger', title, ...(description ? { description } : {}) }),
    }),
    [notify],
  )

  const dismiss = (id: number) => setMessages((current) => current.filter((m) => m.id !== id))

  return (
    <ToastContext.Provider value={value}>
      <Toast.Provider swipeDirection="right" duration={6000}>
        {children}

        {messages.map((message) => {
          const tone = TONE_STYLES[message.tone]
          const Icon = tone.icon
          return (
            <Toast.Root
              key={message.id}
              onOpenChange={(open) => !open && dismiss(message.id)}
              className={cn(
                'flex items-start gap-3 rounded-card border p-4 shadow-overlay',
                'data-[state=open]:animate-slide-up',
                tone.wrapper,
              )}
            >
              <Icon size={20} className="mt-0.5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <Toast.Title className="font-heading text-h3 text-ink">{message.title}</Toast.Title>
                {message.description ? (
                  <Toast.Description className="mt-1 text-body-sm text-ink-secondary">
                    {message.description}
                  </Toast.Description>
                ) : null}
                {message.action ? (
                  <Toast.Action asChild altText={message.action.label}>
                    <button
                      type="button"
                      onClick={message.action.onClick}
                      className="mt-2 min-h-tap text-body-sm font-medium underline underline-offset-2"
                    >
                      {message.action.label}
                    </button>
                  </Toast.Action>
                ) : null}
              </div>
              <Toast.Close
                aria-label="Dismiss notification"
                className="grid size-8 shrink-0 place-items-center rounded-control text-ink-secondary transition-colors duration-micro hover:bg-surface-sunken"
              >
                <X size={16} aria-hidden />
              </Toast.Close>
            </Toast.Root>
          )
        })}

        <Toast.Viewport
          className={cn(
            'fixed z-50 flex w-full max-w-[420px] flex-col gap-3 outline-none',
            // Above the mobile tab bar, clear of the safe area.
            'bottom-[calc(theme(spacing.tabbar)+env(safe-area-inset-bottom)+16px)] left-1/2 -translate-x-1/2 px-4',
            'md:bottom-6 md:left-auto md:right-6 md:translate-x-0 md:px-0',
          )}
        />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside a ToastProvider')
  return context
}
