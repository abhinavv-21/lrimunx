import { filterOptions, fold, foldSearch } from '@/lib/text'

export interface SelectOption {
  value: string
  label: string

  hint?: string
  disabled?: boolean
}

export type SelectMode = 'button' | 'input'

export type SelectRow =
  | { kind: 'option'; option: SelectOption }
  | { kind: 'custom'; value: string }

export interface SelectState {
  open: boolean

  highlighted: number

  query: string

  typeahead: { buffer: string; at: number }
}

export interface SelectContext {
  options: readonly SelectOption[]
  value: string
  allowCustom: boolean
}

export type SelectAction =
  | { type: 'open'; at?: 'selected' | 'first' | 'last' }
  | { type: 'close' }
  | { type: 'commit'; index?: number }
  | { type: 'move'; by: number | 'first' | 'last' }
  | { type: 'highlight'; index: number }
  | { type: 'query'; value: string }
  | { type: 'typeahead'; char: string; now: number }

export type SelectEffect =
  | { type: 'commit'; value: string }
  | { type: 'scrollIntoView'; index: number }
  | { type: 'closed' }

export const initialSelectState: SelectState = {
  open: false,
  highlighted: -1,
  query: '',
  typeahead: { buffer: '', at: 0 },
}

const TYPEAHEAD_WINDOW_MS = 500

const PAGE = 10

export function visibleRows(state: SelectState, ctx: SelectContext): SelectRow[] {
  const matches = filterOptions(ctx.options, state.query)
  const rows: SelectRow[] = matches.map((option) => ({ kind: 'option', option }))

  const typed = state.query.trim()
  if (!ctx.allowCustom || typed === '') return rows

  const already = ctx.options.some((option) => fold(option.label) === fold(typed))
  if (already) return rows

  return [{ kind: 'custom', value: typed }, ...rows]
}

function isEnabled(row: SelectRow | undefined): boolean {
  if (row === undefined) return false
  return row.kind === 'custom' || row.option.disabled !== true
}

function firstEnabled(rows: readonly SelectRow[]): number {
  const at = rows.findIndex((row) => isEnabled(row))
  return at
}

function lastEnabled(rows: readonly SelectRow[]): number {
  for (let i = rows.length - 1; i >= 0; i -= 1) if (isEnabled(rows[i])) return i
  return -1
}

function step(rows: readonly SelectRow[], from: number, count: number): number {
  const direction = count > 0 ? 1 : -1
  let at = from
  let remaining = Math.abs(count)
  let last = from >= 0 && isEnabled(rows[from]) ? from : -1

  while (remaining > 0) {
    at += direction
    if (at < 0 || at >= rows.length) break
    if (isEnabled(rows[at])) {
      last = at
      remaining -= 1
    }
  }

  if (last !== -1) return last
  return direction > 0 ? firstEnabled(rows) : lastEnabled(rows)
}

function indexOfValue(rows: readonly SelectRow[], value: string): number {
  return rows.findIndex((row) => row.kind === 'option' && row.option.value === value)
}

export interface SelectResult {
  state: SelectState
  effects: SelectEffect[]
}

export function selectReducer(
  state: SelectState,
  action: SelectAction,
  ctx: SelectContext,
): SelectResult {
  const rows = visibleRows(state, ctx)

  switch (action.type) {
    case 'open': {
      if (state.open) return { state, effects: [] }
      let highlighted: number
      if (action.at === 'first') highlighted = firstEnabled(rows)
      else if (action.at === 'last') highlighted = lastEnabled(rows)
      else {
        const selected = indexOfValue(rows, ctx.value)
        highlighted = selected !== -1 ? selected : firstEnabled(rows)
      }
      return {
        state: { ...state, open: true, highlighted },
        effects: highlighted >= 0 ? [{ type: 'scrollIntoView', index: highlighted }] : [],
      }
    }

    case 'close': {
      if (!state.open) return { state, effects: [] }
      return {
        state: { ...state, open: false, highlighted: -1, query: '', typeahead: { buffer: '', at: 0 } },
        effects: [{ type: 'closed' }],
      }
    }

    case 'commit': {
      const at = action.index ?? state.highlighted
      const row = rows[at]
      const closed: SelectState = {
        ...state,
        open: false,
        highlighted: -1,
        query: '',
        typeahead: { buffer: '', at: 0 },
      }

      if (!isEnabled(row) || row === undefined) {
        return { state: closed, effects: [{ type: 'closed' }] }
      }

      const value = row.kind === 'custom' ? row.value : row.option.value
      return { state: closed, effects: [{ type: 'commit', value }, { type: 'closed' }] }
    }

    case 'move': {
      if (!state.open) return { state, effects: [] }
      let next: number
      if (action.by === 'first') next = firstEnabled(rows)
      else if (action.by === 'last') next = lastEnabled(rows)
      else next = step(rows, state.highlighted, action.by)
      if (next === state.highlighted || next < 0) return { state, effects: [] }
      return {
        state: { ...state, highlighted: next },
        effects: [{ type: 'scrollIntoView', index: next }],
      }
    }

    case 'highlight': {
      if (!isEnabled(rows[action.index])) return { state, effects: [] }
      return { state: { ...state, highlighted: action.index }, effects: [] }
    }

    case 'query': {
      const next: SelectState = { ...state, open: true, query: action.value }

      const nextRows = visibleRows(next, ctx)
      const highlighted = firstEnabled(nextRows)
      return {
        state: { ...next, highlighted },
        effects: highlighted >= 0 ? [{ type: 'scrollIntoView', index: highlighted }] : [],
      }
    }

    case 'typeahead': {
      const fresh = action.now - state.typeahead.at > TYPEAHEAD_WINDOW_MS
      const buffer = (fresh ? '' : state.typeahead.buffer) + action.char
      const needle = foldSearch(buffer)
      const at = rows.findIndex(
        (row) => isEnabled(row) && row.kind === 'option' && foldSearch(row.option.label).startsWith(needle),
      )
      const typeahead = { buffer, at: action.now }
      if (at === -1) return { state: { ...state, open: true, typeahead }, effects: [] }
      return {
        state: { ...state, open: true, highlighted: at, typeahead },
        effects: [{ type: 'scrollIntoView', index: at }],
      }
    }
  }
}

export interface KeyPlan {
  actions: SelectAction[]

  preventDefault: boolean

  stopPropagation: boolean
}

const NOTHING: KeyPlan = { actions: [], preventDefault: false, stopPropagation: false }

const handled = (actions: SelectAction[], stopPropagation = false): KeyPlan => ({
  actions,
  preventDefault: true,
  stopPropagation,
})

function isPrintable(key: string, mods: { ctrl: boolean; meta: boolean }): boolean {
  return key.length === 1 && !mods.ctrl && !mods.meta
}

export function keyToActions(
  key: string,
  mods: { alt: boolean; ctrl: boolean; meta: boolean },
  state: SelectState,
  mode: SelectMode,
  now: number,
): KeyPlan {
  if (!state.open) {
    switch (key) {
      case 'ArrowDown':
      case 'ArrowUp':
        return handled([{ type: 'open', at: 'selected' }])
      case 'Enter':
        return handled([{ type: 'open', at: 'selected' }])
      case ' ':
        return mode === 'button' ? handled([{ type: 'open', at: 'selected' }]) : NOTHING
      case 'Home':
        return mode === 'button' ? handled([{ type: 'open', at: 'first' }]) : NOTHING
      case 'End':
        return mode === 'button' ? handled([{ type: 'open', at: 'last' }]) : NOTHING
      default:
        if (mode === 'button' && isPrintable(key, mods)) {
          return handled([{ type: 'typeahead', char: key, now }])
        }

        return NOTHING
    }
  }

  switch (key) {
    case 'ArrowDown':
      return handled([{ type: 'move', by: 1 }])
    case 'ArrowUp':
      return mods.alt ? handled([{ type: 'close' }]) : handled([{ type: 'move', by: -1 }])
    case 'Home':
      return handled([{ type: 'move', by: 'first' }])
    case 'End':
      return handled([{ type: 'move', by: 'last' }])
    case 'PageDown':
      return handled([{ type: 'move', by: PAGE }])
    case 'PageUp':
      return handled([{ type: 'move', by: -PAGE }])
    case 'Enter':
      return handled([{ type: 'commit' }])
    case ' ':
      return mode === 'button' ? handled([{ type: 'commit' }]) : NOTHING
    case 'Escape':
      return handled([{ type: 'close' }], true)
    case 'Tab':
      return { actions: [{ type: 'commit' }], preventDefault: false, stopPropagation: false }
    default:
      if (mode === 'button' && isPrintable(key, mods)) {
        return handled([{ type: 'typeahead', char: key, now }])
      }
      return NOTHING
  }
}

export function applyActions(
  state: SelectState,
  actions: readonly SelectAction[],
  ctx: SelectContext,
): SelectResult {
  let next = state
  const effects: SelectEffect[] = []
  for (const action of actions) {
    const result = selectReducer(next, action, ctx)
    next = result.state
    effects.push(...result.effects)
  }
  return { state: next, effects }
}
