import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useToast } from '@/providers/ToastProvider'
import { useDebounced, useDeleteLedgerEntry, useLedger, useLedgerSummary } from '@/lib/hooks'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar, SearchField } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card, CardHeader, Stat } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { Field, Input } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState, ErrorState, SkeletonCards, SkeletonRows } from '@/components/ui/States'
import { LedgerEntryDialog } from './LedgerEntryDialog'
import { CATEGORY_LABELS, LEDGER_CATEGORIES, TIER_LABELS, TIER_MEANING, formatMoney } from './money'
import { netOf, tierRows, type TierRow } from './summary'
import type { LedgerEntry, LedgerSummary } from '@/types/api'

const CATEGORY_FILTERS: SelectOption[] = [
  { value: '', label: 'Every category' },
  ...LEDGER_CATEGORIES.map((category) => ({ value: category, label: CATEGORY_LABELS[category] })),
]

/** A figure that is money, right-aligned and in the tabular face the tables use. */
function Money({ amount, tone = 'ink' }: { amount: number; tone?: 'ink' | 'muted' | 'danger' }) {
  return (
    <span
      className={cn(
        'font-mono text-data tabular-nums',
        tone === 'danger' ? 'text-danger' : tone === 'muted' ? 'text-ink-tertiary' : 'text-ink',
      )}
    >
      {formatMoney(amount)}
    </span>
  )
}

const TIER_COLUMNS: Array<ColumnDef<TierRow, unknown>> = [
  {
    id: 'tier',
    header: 'Tier',
    accessorFn: (row) => row.tier,
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="font-medium text-ink">{TIER_LABELS[row.original.tier]}</span>
        <span className="block text-body-sm text-ink-secondary">{TIER_MEANING[row.original.tier]}</span>
      </div>
    ),
    meta: { hideOnMobile: true },
  },
  {
    id: 'count',
    header: 'Delegates',
    accessorFn: (row) => row.count,
    cell: ({ row }) => <span className="tabular-nums">{row.original.count}</span>,
    meta: { align: 'right', mono: true },
  },
  {
    id: 'rate',
    header: 'Rate',
    accessorFn: (row) => row.rate,
    cell: ({ row }) => <Money amount={row.original.rate} tone="muted" />,
    meta: { align: 'right' },
  },
  {
    id: 'collected',
    header: 'Collected',
    accessorFn: (row) => row.collected,
    cell: ({ row }) => <Money amount={row.original.collected} />,
    meta: { align: 'right' },
  },
  {
    id: 'expected',
    header: 'Expected',
    accessorFn: (row) => row.expected,
    cell: ({ row }) => <Money amount={row.original.expected} tone="muted" />,
    meta: { align: 'right' },
  },
  {
    id: 'shortfall',
    header: 'Shortfall',
    accessorFn: (row) => row.shortfall,
    cell: ({ row }) => (
      <Money
        amount={row.original.shortfall}
        tone={row.original.shortfall > 0 ? 'danger' : row.original.shortfall === 0 ? 'muted' : 'ink'}
      />
    ),
    meta: { align: 'right' },
  },
]

function RegistrationIncome({ summary }: { summary: LedgerSummary }) {
  const { registrations } = summary
  const rows = useMemo(() => tierRows(summary), [summary])

  return (
    <Card>
      <CardHeader
        title="Registration income"
        description="What delegates have actually paid, against what their tier charges. These figures come from the registrations themselves, never from a ledger line."
      />

      {registrations.count === 0 ? (
        <Callout tone="info" className="mb-4">
          No payment has been recorded against a registration yet. Record one on a registration and
          its tier fills in here. The rates below are what the conference is currently charging.
        </Callout>
      ) : null}

      {registrations.unrecorded > 0 ? (
        <Callout tone="warning" className="mb-4">
          {registrations.unrecorded === 1
            ? 'One registration has money against it but no tier, so it is missing from every row below.'
            : `${registrations.unrecorded} registrations have money against them but no tier, so they are missing from every row below.`}{' '}
          <Link to="/registrations" className="font-medium text-ink underline underline-offset-2">
            Set their tier in Registrations
          </Link>
          .
        </Callout>
      ) : null}

      <DataTable
        data={rows}
        columns={TIER_COLUMNS}
        getRowId={(row) => row.tier}
        mobileTitle={(row) => TIER_LABELS[row.tier]}
        mobileSubtitle={(row) => TIER_MEANING[row.tier]}
        caption="Registration income per price tier, with the number of delegates, the rate, and what is still owed"
        emptyState={
          <EmptyState
            icon={BookOpen}
            title="No tiers configured"
            description="Set the four price tiers in Admin before recording any payment."
          />
        }
      />

      <dl className="mt-4 grid gap-3 border-t border-edge pt-4 sm:grid-cols-3">
        <div>
          <dt className="text-label uppercase text-ink-secondary">Collected</dt>
          <dd className="mt-1"><Money amount={registrations.collected} /></dd>
        </div>
        <div>
          <dt className="text-label uppercase text-ink-secondary">Expected</dt>
          <dd className="mt-1"><Money amount={registrations.expected} tone="muted" /></dd>
        </div>
        <div>
          <dt className="text-label uppercase text-ink-secondary">
            {registrations.shortfall < 0 ? 'Overpaid' : 'Still owed'}
          </dt>
          <dd className="mt-1">
            <Money
              amount={Math.abs(registrations.shortfall)}
              tone={registrations.shortfall > 0 ? 'danger' : 'muted'}
            />
          </dd>
        </div>
      </dl>
    </Card>
  )
}

function LedgerByCategory({ summary }: { summary: LedgerSummary }) {
  const { byCategory, credit, debit } = summary.ledger

  return (
    <Card>
      <CardHeader
        title="Ledger by category"
        description="Everything typed into the ledger below, grouped. Delegate payments are not in here — they are counted once, above."
      />

      {byCategory.length === 0 ? (
        <p className="text-body-sm text-ink-secondary">
          Nothing in the ledger yet, so there is nothing to group. Add the venue invoice or a sponsor
          cheque and it appears here.
        </p>
      ) : (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4">
          <div className="border-b border-edge pb-2 text-label uppercase text-ink-secondary">Category</div>
          <div className="border-b border-edge pb-2 text-right text-label uppercase text-ink-secondary">In</div>
          <div className="border-b border-edge pb-2 text-right text-label uppercase text-ink-secondary">Out</div>

          {byCategory.map((row) => (
            <Fragment key={row.category}>
              <dt className="min-w-0 truncate py-2 text-body-sm text-ink">
                {CATEGORY_LABELS[row.category]}
              </dt>
              <dd className="py-2 text-right">
                <Money amount={row.credit} tone={row.credit === 0 ? 'muted' : 'ink'} />
              </dd>
              <dd className="py-2 text-right">
                <Money amount={row.debit} tone={row.debit === 0 ? 'muted' : 'ink'} />
              </dd>
            </Fragment>
          ))}

          <div className="border-t border-edge pt-2 text-label uppercase text-ink-secondary">Total</div>
          <div className="border-t border-edge pt-2 text-right"><Money amount={credit} /></div>
          <div className="border-t border-edge pt-2 text-right"><Money amount={debit} /></div>
        </dl>
      )}
    </Card>
  )
}

function BudgetSummary() {
  const { data, isPending, isError, error, refetch } = useLedgerSummary()

  if (isPending) {
    return (
      <>
        <SkeletonCards count={3} />
        <div className="mt-6 rounded-card border border-edge bg-surface">
          <SkeletonRows rows={4} columns={5} />
        </div>
      </>
    )
  }

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const { net, registrations, ledger } = data

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Money in"
          value={formatMoney(net.income)}
          hint={`${formatMoney(registrations.collected)} from delegates, ${formatMoney(ledger.credit)} from the ledger`}
        />
        <Stat label="Money out" value={formatMoney(net.expense)} hint="Every debit line in the ledger" />
        <Stat
          label="Balance"
          value={formatMoney(net.balance)}
          hint="Money in, less money out"
          emphasis
        />
      </div>

      {net.balance < 0 ? (
        <Callout tone="danger" className="mt-4" alert>
          Spending has passed what has come in, by {formatMoney(Math.abs(net.balance))}. Either money
          is owed and not yet collected, or the conference is running at a loss.
        </Callout>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <RegistrationIncome summary={data} />
        <LedgerByCategory summary={data} />
      </div>
    </>
  )
}

export function BudgetPage() {
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounced(search)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<LedgerEntry | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LedgerEntry | null>(null)

  const filters = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(category ? { category } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      page,
    }),
    [debouncedSearch, category, from, to, page],
  )

  useEffect(() => setPage(1), [debouncedSearch, category, from, to])

  const { data, isPending, isFetching, isError, error, refetch } = useLedger(filters)
  const remove = useDeleteLedgerEntry()

  const hasFilters = Boolean(search || category || from || to)

  function clearFilters() {
    setSearch('')
    setCategory('')
    setFrom('')
    setTo('')
  }

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(entry: LedgerEntry) {
    setEditing(entry)
    setFormOpen(true)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await remove.mutateAsync(pendingDelete.id)
      toast.success('Entry deleted', pendingDelete.particular)
      setPendingDelete(null)
    } catch (caught) {
      toast.error('Could not delete', errorMessage(caught, 'Try again in a moment.'))
    }
  }

  const columns = useMemo<Array<ColumnDef<LedgerEntry, unknown>>>(
    () => [
      {
        id: 'date',
        header: 'Date',
        accessorFn: (row) => row.entryDate,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-data tabular-nums text-ink">
            {format(new Date(row.original.entryDate), 'd MMM yyyy')}
          </span>
        ),
      },
      {
        id: 'particular',
        header: 'Particular',
        accessorFn: (row) => row.particular,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="text-ink">{row.original.particular}</span>
            {row.original.note ? (
              <span className="block text-body-sm text-ink-secondary">{row.original.note}</span>
            ) : null}
          </div>
        ),
        meta: { hideOnMobile: true },
      },
      {
        id: 'category',
        header: 'Category',
        accessorFn: (row) => row.category,
        cell: ({ row }) => <span className="text-ink">{CATEGORY_LABELS[row.original.category]}</span>,
      },
      {
        id: 'credit',
        header: 'Credit',
        accessorFn: (row) => row.credit,
        cell: ({ row }) => (
          <Money amount={row.original.credit} tone={row.original.credit === 0 ? 'muted' : 'ink'} />
        ),
        meta: { align: 'right' },
      },
      {
        id: 'debit',
        header: 'Debit',
        accessorFn: (row) => row.debit,
        cell: ({ row }) => (
          <Money amount={row.original.debit} tone={row.original.debit === 0 ? 'muted' : 'ink'} />
        ),
        meta: { align: 'right' },
      },
      {
        id: 'recordedBy',
        header: 'Recorded by',
        accessorFn: (row) => row.recordedBy.fullName,
        cell: ({ row }) => (
          <span className="text-body-sm text-ink-secondary">{row.original.recordedBy.fullName}</span>
        ),
        meta: { hideOnMobile: true },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${row.original.particular}`}
              onClick={(event) => {
                event.stopPropagation()
                openEdit(row.original)
              }}
            >
              <Pencil size={16} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${row.original.particular}`}
              onClick={(event) => {
                event.stopPropagation()
                setPendingDelete(row.original)
              }}
            >
              <Trash2 size={16} aria-hidden />
            </Button>
          </div>
        ),
        meta: { align: 'right' },
      },
    ],
    [],
  )

  return (
    <>
      <PageHeader
        title="Budget"
        description="Where the conference stands: what delegates have paid, what has been spent, and what is left. Every figure is in whole Nepali rupees."
        actions={
          <Button onClick={openNew}>
            <Plus size={16} aria-hidden />
            New entry
          </Button>
        }
      />

      <BudgetSummary />

      <section className="mt-8">
        <CardHeader
          title="Ledger"
          description="Every rupee that is not a delegate payment — invoices, sponsor cheques, printing, transport. One line each, credit or debit, never both."
        />

        <FilterBar>
          <SearchField value={search} onChange={setSearch} placeholder="Particular or note" />

          <Field label="Category">
            {({ id }) => (
              <Select id={id} value={category} onChange={setCategory} options={CATEGORY_FILTERS} />
            )}
          </Field>

          <Field label="From">
            {({ id }) => (
              <Input id={id} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            )}
          </Field>

          <Field label="To">
            {({ id }) => (
              <Input id={id} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            )}
          </Field>
        </FilterBar>

        {isPending ? (
          <SkeletonRows rows={6} columns={5} />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <>
            {data.items.length > 0 ? (
              <div className="mb-4 rounded-card border border-edge bg-surface-sunken p-4">
                <p className="text-body-sm text-ink-secondary" aria-live="polite">
                  Across all {data.total} {data.total === 1 ? 'entry' : 'entries'}
                  {hasFilters ? ' matching these filters' : ''}, not just this page
                  {isFetching ? ' · updating…' : ''}
                </p>
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-label uppercase text-ink-secondary">Money in</dt>
                    <dd className="mt-1"><Money amount={data.totals.credit} /></dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase text-ink-secondary">Money out</dt>
                    <dd className="mt-1"><Money amount={data.totals.debit} /></dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase text-ink-secondary">Net</dt>
                    <dd className="mt-1">
                      <Money
                        amount={netOf(data.totals)}
                        tone={netOf(data.totals) < 0 ? 'danger' : 'ink'}
                      />
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}

            <DataTable
              data={data.items}
              columns={columns}
              getRowId={(row) => row.id}
              mobileTitle={(row) => row.particular}
              mobileSubtitle={(row) =>
                `${format(new Date(row.entryDate), 'd MMM yyyy')} · ${row.recordedBy.fullName}`
              }
              caption="Ledger entries with date, particular, category, credit and debit"
              emptyState={
                hasFilters ? (
                  <EmptyState
                    icon={Search}
                    title="No entries match those filters"
                    description="Widen the date range, or clear the category and search box."
                    action={
                      <Button variant="secondary" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={BookOpen}
                    title="The ledger is empty"
                    description="Start with what you already know the conference owes — the hall, the printing, the awards. Delegate payments do not belong here; they are recorded on the registration."
                    action={
                      <Button onClick={openNew}>
                        <Plus size={16} aria-hidden />
                        New entry
                      </Button>
                    }
                  />
                )
              }
            />

            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={setPage}
              noun="entries"
            />
          </>
        )}
      </section>

      <LedgerEntryDialog open={formOpen} onOpenChange={setFormOpen} entry={editing} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this entry?"
        description={
          pendingDelete
            ? `Remove ${pendingDelete.particular} — ${formatMoney(pendingDelete.credit > 0 ? pendingDelete.credit : pendingDelete.debit)}. The totals above change immediately, and the deletion is kept in the audit log.`
            : ''
        }
        onConfirm={() => void confirmDelete()}
        loading={remove.isPending}
      />
    </>
  )
}
