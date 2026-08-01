import '@tanstack/react-table'

declare module '@tanstack/react-table' {
  /**
   * Per-column presentation hints consumed by DataTable. Kept in meta so the
   * column definitions stay declarative and the table component owns styling.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'left' | 'right'
    /** Render in JetBrains Mono with tabular numerals — IDs, counts, dates. */
    mono?: boolean
    /** Omit from the stacked mobile card (usually because it is the title). */
    hideOnMobile?: boolean
  }
}
