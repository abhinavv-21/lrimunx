import { Children, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Field, Input } from './Field'
import { cn } from '@/lib/utils'

const COLUMNS: Record<number, string> = {
  1: 'sm:max-w-sm',
  2: 'sm:grid-cols-2 lg:max-w-2xl',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  const count = Children.count(children)
  const columns = COLUMNS[count] ?? 'sm:grid-cols-2 lg:grid-cols-4'

  return <div className={cn('mb-6 grid gap-4', columns, className)}>{children}</div>
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label = 'Search',
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label?: string
}) {
  return (
    <Field label={label}>
      {({ id }) => (
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
            aria-hidden
          />
          <Input
            id={id}
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className="pl-9"
          />
        </div>
      )}
    </Field>
  )
}
