import { describe, expect, it } from 'vitest'
import {
  applyActions,
  initialSelectState,
  keyToActions,
  selectReducer,
  visibleRows,
  type SelectContext,
  type SelectOption,
  type SelectState,
} from './selectState'

const COMMITTEES: SelectOption[] = [
  { value: '', label: 'Unallocated' },
  { value: 'unsc', label: 'UNSC', hint: '3 open' },
  { value: 'disec', label: 'DISEC', hint: 'full', disabled: true },
  { value: 'unhrc', label: 'UNHRC', hint: '7 open' },
]

const ctx = (over: Partial<SelectContext> = {}): SelectContext => ({
  options: COMMITTEES,
  value: '',
  allowCustom: false,
  ...over,
})

const NO_MODS = { alt: false, ctrl: false, meta: false }

function press(keys: string[], context: SelectContext, mode: 'button' | 'input' = 'button') {
  let state: SelectState = initialSelectState
  const effects = []
  const plans = []
  for (const key of keys) {
    const plan = keyToActions(key, NO_MODS, state, mode, 0)
    plans.push(plan)
    const result = applyActions(state, plan.actions, context)
    state = result.state
    effects.push(...result.effects)
  }
  return { state, effects, plans, committed: effects.filter((e) => e.type === 'commit') }
}

describe('arrows never commit', () => {
  it('opens on ArrowDown without committing anything', () => {
    const { state, committed } = press(['ArrowDown'], ctx())
    expect(state.open).toBe(true)
    expect(committed).toHaveLength(0)
  })

  it('stays silent through a long run of arrow presses', () => {
    const { committed } = press(
      ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowDown'],
      ctx(),
    )
    expect(committed).toHaveLength(0)
  })

  it('commits exactly once, and only on Enter', () => {
    const { committed } = press(['ArrowDown', 'ArrowDown', 'Enter'], ctx())
    expect(committed).toEqual([{ type: 'commit', value: 'unsc' }])
  })
})

describe('navigation bounds', () => {
  const open = (): { state: SelectState; context: SelectContext } => {
    const context = ctx()
    const { state } = selectReducer(initialSelectState, { type: 'open', at: 'first' }, context)
    return { state, context }
  }

  it('skips disabled rows', () => {
    const { state, context } = open()

    const after = applyActions(state, [{ type: 'move', by: 1 }, { type: 'move', by: 1 }], context)
    const rows = visibleRows(after.state, context)
    const row = rows[after.state.highlighted]
    expect(row?.kind === 'option' && row.option.value).toBe('unhrc')
  })

  it('stops at the last row rather than wrapping', () => {
    const { state, context } = open()
    const after = applyActions(
      state,
      [{ type: 'move', by: 1 }, { type: 'move', by: 1 }, { type: 'move', by: 1 }, { type: 'move', by: 1 }],
      context,
    )
    const rows = visibleRows(after.state, context)
    const row = rows[after.state.highlighted]
    expect(row?.kind === 'option' && row.option.value).toBe('unhrc')
  })

  it('stops at the first row rather than wrapping backwards', () => {
    const { state, context } = open()
    const after = applyActions(state, [{ type: 'move', by: -1 }, { type: 'move', by: -1 }], context)
    expect(after.state.highlighted).toBe(0)
  })

  it('Home and End land on enabled rows', () => {
    const { state, context } = open()
    const end = selectReducer(state, { type: 'move', by: 'last' }, context)
    const rows = visibleRows(end.state, context)
    const row = rows[end.state.highlighted]

    expect(row?.kind === 'option' && row.option.value).toBe('unhrc')

    const home = selectReducer(end.state, { type: 'move', by: 'first' }, context)
    expect(home.state.highlighted).toBe(0)
  })

  it('never highlights a disabled row, so a disabled row can never commit', () => {
    const context = ctx()
    const { state } = selectReducer(initialSelectState, { type: 'open', at: 'first' }, context)

    const hovered = selectReducer(state, { type: 'highlight', index: 2 }, context)
    expect(hovered.state.highlighted).not.toBe(2)

    const committed = selectReducer(state, { type: 'commit', index: 2 }, context)
    expect(committed.effects.filter((e) => e.type === 'commit')).toHaveLength(0)
  })
})

describe('Escape and Enter', () => {
  it('Escape closes without changing the value, and stops propagating', () => {
    const context = ctx({ value: 'unsc' })
    let state = selectReducer(initialSelectState, { type: 'open' }, context).state
    state = selectReducer(state, { type: 'move', by: 1 }, context).state

    const plan = keyToActions('Escape', NO_MODS, state, 'button', 0)

    expect(plan.stopPropagation).toBe(true)
    const after = applyActions(state, plan.actions, context)
    expect(after.state.open).toBe(false)
    expect(after.effects.filter((e) => e.type === 'commit')).toHaveLength(0)
  })

  it('Escape with the menu already shut belongs to the dialog', () => {
    const plan = keyToActions('Escape', NO_MODS, initialSelectState, 'button', 0)
    expect(plan.actions).toHaveLength(0)
    expect(plan.stopPropagation).toBe(false)
    expect(plan.preventDefault).toBe(false)
  })

  it('Enter is prevented, so it cannot submit the surrounding form', () => {
    const context = ctx()
    const state = selectReducer(initialSelectState, { type: 'open', at: 'first' }, context).state
    expect(keyToActions('Enter', NO_MODS, state, 'button', 0).preventDefault).toBe(true)

    expect(keyToActions('Enter', NO_MODS, initialSelectState, 'button', 0).preventDefault).toBe(true)
  })

  it('Tab commits but is not prevented, so focus still moves on', () => {
    const context = ctx()
    const state = selectReducer(initialSelectState, { type: 'open', at: 'first' }, context).state
    const plan = keyToActions('Tab', NO_MODS, state, 'button', 0)
    expect(plan.preventDefault).toBe(false)
    expect(applyActions(state, plan.actions, context).effects).toContainEqual({
      type: 'commit',
      value: '',
    })
  })
})

describe('filtering and allowCustom', () => {
  const COUNTRIES: SelectOption[] = [
    { value: '', label: 'Unallocated' },
    { value: 'France', label: 'France', hint: 'Aarav Menon', disabled: true },
    { value: "Côte d'Ivoire", label: "Côte d'Ivoire" },
    { value: 'Chad', label: 'Chad' },
  ]

  it('filters as you type and highlights the first enabled match', () => {
    const context = ctx({ options: COUNTRIES })
    const after = selectReducer(initialSelectState, { type: 'query', value: 'cote' }, context)
    const rows = visibleRows(after.state, context)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind === 'option' && rows[0].option.label).toBe("Côte d'Ivoire")
    expect(after.state.highlighted).toBe(0)
  })

  it('skips a disabled match when choosing the initial highlight', () => {
    const context = ctx({ options: COUNTRIES })
    const after = selectReducer(initialSelectState, { type: 'query', value: 'france' }, context)

    expect(after.state.highlighted).toBe(-1)
    const committed = selectReducer(after.state, { type: 'commit' }, context)
    expect(committed.effects.filter((e) => e.type === 'commit')).toHaveLength(0)
  })

  it('offers a custom row when nothing matches, and commits the typed text', () => {
    const context = ctx({ options: COUNTRIES, allowCustom: true })
    const after = selectReducer(initialSelectState, { type: 'query', value: 'Narnia' }, context)
    const rows = visibleRows(after.state, context)
    expect(rows[0]).toEqual({ kind: 'custom', value: 'Narnia' })
    expect(after.state.highlighted).toBe(0)

    const committed = selectReducer(after.state, { type: 'commit' }, context)
    expect(committed.effects).toContainEqual({ type: 'commit', value: 'Narnia' })
  })

  it('offers no custom row when the typed text already names an option', () => {
    const context = ctx({ options: COUNTRIES, allowCustom: true })
    const after = selectReducer(initialSelectState, { type: 'query', value: 'chad' }, context)
    const rows = visibleRows(after.state, context)
    expect(rows.some((r) => r.kind === 'custom')).toBe(false)
  })

  it('without allowCustom, an unmatched query commits nothing', () => {
    const context = ctx({ options: COUNTRIES, allowCustom: false })
    const after = selectReducer(initialSelectState, { type: 'query', value: 'Narnia' }, context)
    expect(visibleRows(after.state, context)).toHaveLength(0)
    const committed = selectReducer(after.state, { type: 'commit' }, context)
    expect(committed.effects.filter((e) => e.type === 'commit')).toHaveLength(0)
  })

  it('forgets the query when the menu closes', () => {
    const context = ctx({ options: COUNTRIES })
    const typed = selectReducer(initialSelectState, { type: 'query', value: 'cha' }, context)
    const closed = selectReducer(typed.state, { type: 'close' }, context)
    expect(closed.state.query).toBe('')
  })
})

describe('type-to-jump on a button trigger', () => {
  it('jumps to the first label starting with the buffer', () => {
    const context = ctx()
    const state = selectReducer(initialSelectState, { type: 'open', at: 'first' }, context).state
    const after = applyActions(
      state,
      [
        { type: 'typeahead', char: 'u', now: 1000 },
        { type: 'typeahead', char: 'n', now: 1100 },
        { type: 'typeahead', char: 'h', now: 1200 },
      ],
      context,
    )
    const rows = visibleRows(after.state, context)
    const row = rows[after.state.highlighted]
    expect(row?.kind === 'option' && row.option.value).toBe('unhrc')
  })

  it('starts a new buffer after the window lapses', () => {
    const context = ctx()
    const state = selectReducer(initialSelectState, { type: 'open', at: 'first' }, context).state
    const after = applyActions(
      state,
      [
        { type: 'typeahead', char: 'u', now: 1000 },
        { type: 'typeahead', char: 'd', now: 9000 },
      ],
      context,
    )

    expect(after.state.typeahead.buffer).toBe('d')
  })

  it('does not type-jump on an input trigger, where letters are the query', () => {
    const plan = keyToActions('u', NO_MODS, { ...initialSelectState, open: true }, 'input', 0)
    expect(plan.actions).toHaveLength(0)
  })
})
