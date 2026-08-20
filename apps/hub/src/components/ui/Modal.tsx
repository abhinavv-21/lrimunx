import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { X } from 'lucide-react'
import { Button } from './Button'
import { Field, Input } from './Field'
import { cn } from '@/lib/utils'

const OVERLAY = 'fixed inset-0 z-40 bg-surface-inverted/40 backdrop-blur-[1px]'

const PANEL = cn(
  'fixed z-50 flex flex-col gap-4 border border-edge bg-surface shadow-overlay',
  'focus:outline-none',
  'inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-card p-5',
  'md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card md:p-6',
  'data-[state=open]:animate-slide-up',
  'md:data-[state=open]:animate-dialog-in',
)

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  holdsInput = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode

  holdsInput?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY} />
        <Dialog.Content
          className={PANEL}
          {...(holdsInput
            ? { onInteractOutside: (event: Event) => event.preventDefault() }
            : {})}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="font-heading text-h2 text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 max-w-prose text-body-sm text-ink-secondary">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X size={18} aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-w-0">{children}</div>

          {footer ? <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export const CONFIRM_PHRASE = 'lrimunx'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  loading = false,
  confirmPhrase,
  confirmDisabled = false,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  loading?: boolean

  confirmPhrase?: string

  confirmDisabled?: boolean
  children?: ReactNode
}) {
  const [typed, setTyped] = useState('')
  const phraseRef = useRef<HTMLInputElement>(null)

  const phraseTyped = confirmPhrase === undefined || typed.trim() === confirmPhrase
  const blocked = confirmDisabled || !phraseTyped

  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={OVERLAY} />
        <AlertDialog.Content
          className={PANEL}
          onOpenAutoFocus={(event) => {
            if (confirmPhrase === undefined) return

            event.preventDefault()
            phraseRef.current?.focus()
          }}
        >
          <AlertDialog.Title className="font-heading text-h2 text-ink">{title}</AlertDialog.Title>
          <AlertDialog.Description className="max-w-prose text-body-sm text-ink-secondary">
            {description}
          </AlertDialog.Description>

          {children}

          {confirmPhrase !== undefined ? (
            <Field label={`Type ${confirmPhrase} to confirm`}>
              {({ id }) => (
                <Input
                  id={id}
                  ref={phraseRef}
                  value={typed}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="font-mono"
                  onChange={(event) => setTyped(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    if (!blocked && !loading) onConfirm()
                  }}
                />
              )}
            </Field>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={loading}>Cancel</Button>
            </AlertDialog.Cancel>
            <Button variant="destructive" onClick={onConfirm} loading={loading} disabled={blocked}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
