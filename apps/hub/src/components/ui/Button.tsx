import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type Size = 'md' | 'sm' | 'icon'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-pressed disabled:bg-surface-sunken disabled:text-ink-tertiary',
  secondary: 'bg-surface text-ink border border-edge-strong hover:bg-surface-sunken active:bg-edge disabled:text-ink-tertiary disabled:hover:bg-surface',
  ghost: 'bg-transparent text-ink-secondary hover:bg-surface-sunken hover:text-ink active:bg-edge disabled:text-ink-tertiary disabled:hover:bg-transparent',
  destructive: 'bg-danger text-white hover:brightness-110 active:brightness-95 disabled:bg-surface-sunken disabled:text-ink-tertiary',
}

const SIZES: Record<Size, string> = {
  md: 'min-h-tap md:min-h-10 px-5 py-3 md:py-2 text-body',
  sm: 'min-h-tap md:min-h-9 px-3 py-2 text-body-sm',
  icon: 'size-tap md:size-9 p-0',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, asChild = false, disabled, children, ...props },
  ref,
) {
  const Component = asChild ? Slot : 'button'

  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-control font-medium',
    'transition-colors duration-micro ease-out',
    'disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    className,
  )

  return (
    <Component
      ref={ref}
      {...(asChild ? {} : { disabled: disabled || loading })}
      {...(asChild && (disabled || loading) ? { 'aria-disabled': true } : {})}
      aria-busy={loading || undefined}
      className={classes}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
      {asChild ? <Slottable>{children}</Slottable> : children}
    </Component>
  )
})
