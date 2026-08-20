import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { CONTROL } from './Field'
import { cn } from '@/lib/utils'
import {
  applyActions,
  initialSelectState,
  keyToActions,
  visibleRows,
  type SelectAction,
  type SelectContext,
  type SelectEffect,
  type SelectOption,
} from './selectState'

export type { SelectOption } from './selectState'

export interface SelectProps {
  value: string

  onChange: (value: string) => void
  options: readonly SelectOption[]

  placeholder?: string

  searchable?: boolean | 'auto'

  allowCustom?: boolean
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean

  emptyMessage?: string

  onClose?: () => void
}

const SEARCHABLE_FROM = 8

const MENU_MAX_HEIGHT = 320

export function Select({
  value,
  onChange,
  options,
  placeholder,
  searchable = 'auto',
  allowCustom = false,
  disabled = false,
  id,
  className,
  emptyMessage = 'No matches',
  onClose,
  ...aria
}: SelectProps) {
  const generatedId = useId()
  const triggerId = id ?? `select-${generatedId}`
  const listboxId = `${generatedId}-listbox`
  const optionId = (index: number) => `${generatedId}-option-${index}`

  const canType = allowCustom || (searchable === 'auto' ? options.length >= SEARCHABLE_FROM : searchable)
  const mode = canType ? 'input' : 'button'

  const [state, setState] = useState(initialSelectState)

  const ctx: SelectContext = useMemo(
    () => ({ options, value, allowCustom }),
    [options, value, allowCustom],
  )

  const listRef = useRef<HTMLUListElement | null>(null)

  const anchorRef = useRef<HTMLDivElement | null>(null)

  const latest = useRef({ ctx, state, onChange, onClose })
  latest.current = { ctx, state, onChange, onClose }

  const runEffects = useCallback((effects: readonly SelectEffect[]) => {
    for (const effect of effects) {
      if (effect.type === 'commit') latest.current.onChange(effect.value)
      else if (effect.type === 'closed') latest.current.onClose?.()
    }
  }, [])

  const dispatch = useCallback(
    (...actions: SelectAction[]) => {
      const result = applyActions(latest.current.state, actions, latest.current.ctx)
      latest.current.state = result.state
      setState(result.state)
      runEffects(result.effects)
    },
    [runEffects],
  )

  const rows = useMemo(() => visibleRows(state, ctx), [state, ctx])

  const { refs, floatingStyles, placement, isPositioned } = useFloating({
    open: state.open,
    placement: 'bottom-start',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8, fallbackPlacements: ['top-start'] }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
            maxHeight: `${Math.max(96, Math.min(availableHeight, MENU_MAX_HEIGHT))}px`,
          })
        },
      }),
    ],
  })

  useLayoutEffect(() => {
    if (!state.open || state.highlighted < 0) return
    scrollRowIntoView(listRef.current, state.highlighted)
  }, [state.open, state.highlighted])

  // The menu is portaled to the body so a dialog cannot clip it, and that is
  // exactly what breaks the wheel: Radix mounts react-remove-scroll alongside
  // the dialog, its document listener cancels every wheel event that did not
  // land inside the panel, and by that measure the menu is outside. The list
  // then shows a scrollbar it refuses to move. Stopping the event at the menu
  // means the lock never sees it; `overscroll-contain` on the list is what
  // keeps the page behind from scrolling once the list has run out.
  useEffect(() => {
    const menu = refs.floating.current
    if (!state.open || !menu) return

    const keep = (event: Event) => event.stopPropagation()
    menu.addEventListener('wheel', keep)
    menu.addEventListener('touchmove', keep)
    return () => {
      menu.removeEventListener('wheel', keep)
      menu.removeEventListener('touchmove', keep)
    }
  }, [state.open, refs.floating])

  useEffect(() => {
    if (!state.open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (refs.floating.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      dispatch({ type: 'close' })
    }

    function onEscapeCapture(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      dispatch({ type: 'close' })
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onEscapeCapture, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onEscapeCapture, true)
    }
  }, [state.open, refs.floating, dispatch])

  const selected = options.find((option) => option.value === value)

  const displayLabel = selected?.label ?? (value === '' ? '' : value)
  const showPlaceholder = displayLabel === ''

  function handleKeyDown(event: ReactKeyboardEvent) {
    const plan = keyToActions(
      event.key,
      { alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey },
      state,
      mode,
      Date.now(),
    )
    if (plan.preventDefault) event.preventDefault()
    if (plan.stopPropagation) event.stopPropagation()
    if (plan.actions.length > 0) dispatch(...plan.actions)
  }

  const triggerProps = {
    id: triggerId,
    role: 'combobox' as const,
    'aria-expanded': state.open,
    'aria-controls': state.open ? listboxId : undefined,
    'aria-haspopup': 'listbox' as const,
    'aria-activedescendant':
      state.open && state.highlighted >= 0 ? optionId(state.highlighted) : undefined,
    'aria-label': aria['aria-label'],
    'aria-labelledby': aria['aria-labelledby'],
    'aria-describedby': aria['aria-describedby'],
    'aria-invalid': aria['aria-invalid'],
    disabled,
    onKeyDown: handleKeyDown,
    onBlur: () => {
      if (latest.current.state.open) dispatch({ type: 'close' })
    },
  }

  const chrome = cn(
    CONTROL,
    'flex w-full items-center py-2 pr-9 text-left',
    // Tailwind v3 preflight already gives button a pointer. It does not undo
    // hover on a disabled button, and it resets disabled cursors to default.
    'hover:bg-surface-sunken',
    'disabled:cursor-not-allowed disabled:hover:bg-surface',
    className,
  )

  return (
    <>
      <div
        ref={(node) => {
          anchorRef.current = node
          refs.setReference(node)
        }}
        className="relative"
      >
        {mode === 'input' ? (
          <input
            {...triggerProps}
            type="text"
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            className={chrome}

            value={state.open ? state.query : displayLabel}
            placeholder={showPlaceholder || state.open ? placeholder : undefined}
            onChange={(event) => dispatch({ type: 'query', value: event.target.value })}
            onMouseDown={() => {
              if (!state.open && !disabled) dispatch({ type: 'open', at: 'selected' })
            }}
          />
        ) : (
          <button
            {...triggerProps}
            type="button"
            className={chrome}
            onClick={() => {
              if (disabled) return
              dispatch(state.open ? { type: 'close' } : { type: 'open', at: 'selected' })
            }}
          >
            <span className={cn('min-w-0 flex-1 truncate', showPlaceholder && 'text-ink-tertiary')}>
              {showPlaceholder ? placeholder : displayLabel}
            </span>
          </button>
        )}

        <ChevronDown
          size={16}
          aria-hidden
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary',
            'transition-transform duration-micro ease-out',
            state.open && 'rotate-180',
            disabled && 'opacity-50',
          )}
        />
      </div>

      {state.open
        ? createPortal(
            <div
              ref={refs.setFloating}

              style={{
                ...floatingStyles,
                visibility: isPositioned ? 'visible' : 'hidden',
                // Required, not cosmetic, and inline on purpose.
                //
                // A Radix modal dialog sets pointer-events: none on <body> and
                // re-enables it only on its own layer. This menu portals to
                // <body> as a sibling of that layer, so it inherited the block
                // and stopped being hit-testable: no hover, no click, and the
                // document-level outside-press listener resolved the target to
                // <html> and closed the menu instead of selecting. Every
                // dropdown inside a dialog was inert.
                //
                // Inline because Radix sets its block inline too, and a utility
                // class loses to that the moment anything shifts specificity.
                pointerEvents: 'auto',
              }}
              // Anywhere in the menu, not just on a row: pressing the scrollbar
              // is a press on the list, and letting it move focus closed the
              // menu the moment the treasurer reached for it.
              onMouseDown={(event) => event.preventDefault()}
              className={cn(
                'z-popover flex flex-col overflow-hidden rounded-card border border-edge bg-surface shadow-overlay',
                isPositioned && placement.startsWith('bottom') && 'animate-slide-up',
              )}
            >
              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label={aria['aria-label']}

                className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
              >
                {rows.length === 0 ? (
                  <li className="px-3 py-3 text-body-sm text-ink-secondary">{emptyMessage}</li>
                ) : (
                  rows.map((row, index) => {
                    const isCustom = row.kind === 'custom'
                    const label = isCustom ? `Use "${row.value}"` : row.option.label
                    const hint = isCustom ? 'Not on the list — save it anyway' : row.option.hint
                    const rowDisabled = !isCustom && row.option.disabled === true
                    const isSelected = !isCustom && row.option.value === value
                    const isActive = index === state.highlighted

                    return (
                      <li
                        key={isCustom ? '__custom__' : `${row.option.value}-${index}`}
                        id={optionId(index)}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={rowDisabled || undefined}
                        className={cn(
                          'flex min-h-tap items-center gap-2 px-3 py-2 text-body',
                          'transition-colors duration-micro ease-out',
                          rowDisabled ? 'cursor-not-allowed text-ink-tertiary' : 'cursor-pointer',
                          isActive && !rowDisabled && 'bg-edge',
                          isSelected && !rowDisabled && 'font-medium text-accent',
                          isSelected && isActive && !rowDisabled && 'bg-accent-wash',
                        )}

                        onMouseEnter={() => dispatch({ type: 'highlight', index })}
                        onClick={() => {
                          if (rowDisabled) return
                          dispatch({ type: 'commit', index })
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn('block truncate', isSelected && 'font-medium')}
                            title={label}
                          >
                            {label}
                          </span>
                          {hint ? (
                            <span
                              className="block truncate text-body-sm text-ink-secondary"
                              title={hint}
                            >
                              {hint}
                            </span>
                          ) : null}
                        </span>
                        {isSelected ? (
                          <Check size={16} className="shrink-0 text-accent" aria-hidden />
                        ) : null}
                      </li>
                    )
                  })
                )}
              </ul>

              <p role="status" className="sr-only">
                {rows.length === 0 ? emptyMessage : `${rows.length} available`}
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function scrollRowIntoView(list: HTMLUListElement | null, index: number): void {
  if (!list) return
  const row = list.children[index]
  if (!(row instanceof HTMLElement)) return
  if (row.offsetTop < list.scrollTop) {
    list.scrollTop = row.offsetTop
  } else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight
  }
}
