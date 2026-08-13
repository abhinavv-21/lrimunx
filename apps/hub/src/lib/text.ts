const NBSP = String.fromCharCode(0x00a0)
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)
const ZERO_WIDTH_NON_JOINER = String.fromCharCode(0x200c)
const ZERO_WIDTH_JOINER = String.fromCharCode(0x200d)
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff)

const NBSP_PATTERN = new RegExp(NBSP, 'g')

// eslint-disable-next-line no-misleading-character-class -- see above; these are stripped deliberately.
const INVISIBLE_PATTERN = new RegExp(
  '[' + ZERO_WIDTH_SPACE + ZERO_WIDTH_NON_JOINER + ZERO_WIDTH_JOINER + BYTE_ORDER_MARK + ']',
  'g',
)

function clean(value: string): string {
  return value
    .replace(NBSP_PATTERN, ' ')
    .replace(INVISIBLE_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function fold(value: string): string {
  return clean(value).toLowerCase()
}

export function foldSearch(value: string): string {
  return clean(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export interface FilterableOption {
  label: string
  hint?: string
}

function rank(option: FilterableOption, query: string): number | null {
  const label = foldSearch(option.label)
  if (label.startsWith(query)) return 0
  if (label.includes(query)) return 1

  if (option.hint !== undefined && foldSearch(option.hint).includes(query)) return 2
  return null
}

export function filterOptions<T extends FilterableOption>(options: readonly T[], query: string): T[] {
  const needle = foldSearch(query)
  if (needle === '') return [...options]

  const scored: Array<{ option: T; rank: number; at: number }> = []
  options.forEach((option, at) => {
    const r = rank(option, needle)
    if (r !== null) scored.push({ option, rank: r, at })
  })

  scored.sort((a, b) => a.rank - b.rank || a.at - b.at)
  return scored.map((entry) => entry.option)
}
