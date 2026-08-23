import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export const CONTROL = cn(
  'w-full rounded-control border border-edge-strong bg-surface px-3',
  'min-h-tap md:min-h-10 text-body text-ink',
  'transition-colors duration-micro ease-out',
  'hover:border-ink-tertiary',
  'disabled:bg-surface-sunken disabled:text-ink-tertiary disabled:cursor-not-allowed',
  'aria-[invalid=true]:border-danger',
)

interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label uppercase text-ink-secondary">
        {label}
        {required ? <span className="ml-1 text-accent" aria-hidden>*</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {error ? (
        <p id={errorId} role="alert" className="text-body-sm text-danger">{error}</p>
      ) : hint ? (
        <p id={hintId} className="text-body-sm text-ink-secondary">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL, 'py-2', className)} {...props} />
  },
)

/**
 * A password box you can read back.
 *
 * Worth having for the reason people usually mistype: these accounts are issued
 * by the secretariat, so the password is being copied off a message rather than
 * recalled, and a wrong character is invisible until the whole thing is
 * refused. The toggle is a button, not a checkbox, because it acts immediately
 * rather than setting something to be submitted.
 *
 * type is deliberately not accepted: this component is the password one.
 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function PasswordInput({ className, ...props }, ref) {
  const [shown, setShown] = useState(false)
  const Icon = shown ? EyeOff : Eye

  return (
    <div className="relative">
      <input
        ref={ref}
        type={shown ? 'text' : 'password'}
        className={cn(CONTROL, 'py-2 pr-12', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShown((current) => !current)}
        aria-pressed={shown}
        // The field it belongs to is named by its own label; this button needs
        // to say what IT does, and "Show password" alone reads as a statement
        // of the current state rather than an action.
        aria-label={shown ? 'Hide the password' : 'Show the password'}
        title={shown ? 'Hide the password' : 'Show the password'}
        className={cn(
          'absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-control',
          'text-ink-tertiary transition-colors duration-micro',
          'hover:text-ink focus-visible:text-ink',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent',
        )}
      >
        <Icon size={18} aria-hidden />
      </button>
    </div>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(CONTROL, 'resize-y py-2.5 leading-relaxed', className)} {...props} />
  },
)

