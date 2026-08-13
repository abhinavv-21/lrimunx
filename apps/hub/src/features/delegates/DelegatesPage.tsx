import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Download, Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react'
import { useIsAdmin } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { useCommittees, useDebounced, useDelegates, useDeleteDelegate } from '@/lib/hooks'
import { downloadExport } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar, SearchField } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { useCommitteeFilterOptions } from '@/lib/selectOptions'
import { DataTable } from '@/components/ui/DataTable'
import { AttendanceBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States'
import { DelegateForm } from './DelegateForm'
import { CsvImportDialog } from './CsvImportDialog'
import type { Delegate } from '@/types/api'

const ATTENDANCE_FILTERS: SelectOption[] = [
  { value: '', label: 'Any attendance' },
  { value: 'CHECKED_IN', label: 'Checked in' },
  { value: 'ABSENT', label: 'Absent' },
]

const DELEGATE_SORTS: SelectOption[] = [
  { value: 'fullName', label: 'Name', hint: 'A to Z' },
  { value: 'schoolName', label: 'School' },
  { value: 'committee', label: 'Committee', hint: 'Then by name' },
  { value: 'createdAt', label: 'Recently added' },
]

export function DelegatesPage() {
  const toast = useToast()
  const isAdmin = useIsAdmin()

  const [search, setSearch] = useState('')
  const [attendanceStatus, setAttendanceStatus] = useState('')
  const [committeeId, setCommitteeId] = useState('')
  const [sortBy, setSortBy] = useState('fullName')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounced(search)

  const [editing, setEditing] = useState<Delegate | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Delegate | null>(null)

  const filters = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(attendanceStatus ? { attendanceStatus } : {}),
      ...(committeeId ? { committeeId } : {}),
      sortBy,
      page,
    }),
    [debouncedSearch, attendanceStatus, committeeId, sortBy, page],
  )

  useEffect(() => setPage(1), [debouncedSearch, attendanceStatus, committeeId, sortBy])

  const { data, isPending, isFetching, isError, error, refetch } = useDelegates(filters)
  const { data: committees } = useCommittees()
  const remove = useDeleteDelegate()
  const committeeOptions = useCommitteeFilterOptions(committees?.items)

  const hasFilters = Boolean(search || attendanceStatus || committeeId)

  function openEdit(delegate: Delegate) {
    setEditing(delegate)
    setFormOpen(true)
  }

  function clearFilters() {
    setSearch('')
    setAttendanceStatus('')
    setCommitteeId('')
  }

  const columns = useMemo<Array<ColumnDef<Delegate, unknown>>>(() => {
    const base: Array<ColumnDef<Delegate, unknown>> = [
      {
        id: 'name',
        header: 'Name',
        accessorFn: (row) => row.fullName,
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.fullName}</span>,
        meta: { hideOnMobile: true },
      },
      {
        id: 'school',
        header: 'School',
        accessorFn: (row) => row.schoolName,
        cell: ({ row }) => <span className="text-ink">{row.original.schoolName}</span>,
      },
      {
        id: 'contact',
        header: 'Contact',
        accessorFn: (row) => row.phone,
        cell: ({ row }) => (
          <a
            href={`tel:${row.original.phone.replace(/\s/g, '')}`}
            onClick={(event) => event.stopPropagation()}
            className="font-mono text-data text-ink underline-offset-2 hover:underline"
          >
            {row.original.phone}
          </a>
        ),
        meta: { mono: true },
      },
      {
        id: 'email',
        header: 'Email',
        accessorFn: (row) => row.email,
        cell: ({ row }) => (
          <a
            href={`mailto:${row.original.email}`}
            onClick={(event) => event.stopPropagation()}
            className="block max-w-cell truncate font-mono text-data text-ink underline-offset-2 hover:underline"
            title={row.original.email}
          >
            {row.original.email}
          </a>
        ),
        meta: { mono: true },
      },
      {
        id: 'committee',
        header: 'Committee',
        accessorFn: (row) => row.assignment?.committee.code ?? '',
        cell: ({ row }) =>
          row.original.assignment ? (
            <span className="font-mono text-data font-medium text-ink">
              {row.original.assignment.committee.code}
            </span>
          ) : (
            <span className="text-body-sm text-ink-tertiary">Unplaced</span>
          ),
        meta: { mono: true },
      },
      {
        id: 'country',
        header: 'Country',
        accessorFn: (row) => row.assignment?.country ?? '',
        cell: ({ row }) =>
          row.original.assignment ? (
            <span className="text-ink">{row.original.assignment.country}</span>
          ) : (
            <span className="text-body-sm text-ink-tertiary">—</span>
          ),
      },
      {
        id: 'attendance',
        header: 'Attendance',
        accessorFn: (row) => row.attendanceStatus,
        cell: ({ row }) => <AttendanceBadge status={row.original.attendanceStatus} />,
      },
    ]

    if (!isAdmin) return base

    return [
      ...base,
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${row.original.fullName}`}
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
              aria-label={`Delete ${row.original.fullName}`}
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
    ]
  }, [isAdmin])

  async function handleExport(format: 'xlsx' | 'pdf') {
    try {
      await downloadExport(`dataset=delegates&format=${format}`, `delegates.${format}`)
    } catch {
      toast.error('Export failed', 'The file could not be generated. Try again in a moment.')
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await remove.mutateAsync(pendingDelete.id)
      toast.success('Delegate deleted', pendingDelete.fullName)
      setPendingDelete(null)
    } catch (caught) {
      toast.error('Could not delete', caught instanceof Error ? caught.message : undefined)
    }
  }

  return (
    <>
      <PageHeader
        title="Delegates"
        description={
          isAdmin
            ? 'Everyone registered for LRI MUN X. Select a row to edit, including their committee and country.'
            : 'The delegate roster. Read-only — ask the secretariat for any change.'
        }
        actions={
          isAdmin ? (
            <>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload size={16} aria-hidden />
                Import CSV
              </Button>
              <Button variant="secondary" onClick={() => void handleExport('xlsx')}>
                <Download size={16} aria-hidden />
                Export
              </Button>
              <Button
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus size={16} aria-hidden />
                Add delegate
              </Button>
            </>
          ) : null
        }
      />

      <FilterBar>
        <SearchField value={search} onChange={setSearch} placeholder="Name, school, phone or email" />

        <Field label="Committee">
          {({ id }) => (
            <Select id={id} value={committeeId} onChange={setCommitteeId} options={committeeOptions} />
          )}
        </Field>

        <Field label="Attendance">
          {({ id }) => (
            <Select id={id} value={attendanceStatus} onChange={setAttendanceStatus} options={ATTENDANCE_FILTERS} />
          )}
        </Field>

        <Field label="Sort by">
          {({ id }) => (
            <Select id={id} value={sortBy} onChange={setSortBy} options={DELEGATE_SORTS} />
          )}
        </Field>
      </FilterBar>

      {isPending ? (
        <SkeletonRows rows={8} columns={6} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <p className="mb-3 font-mono text-data text-ink-secondary" aria-live="polite">
            {data.total} {data.total === 1 ? 'delegate' : 'delegates'}
            {hasFilters ? ' matching your filters' : ''}
            {isFetching ? ' · updating…' : ''}
          </p>

          <DataTable
            data={data.items}
            columns={columns}
            getRowId={(row) => row.id}
            {...(isAdmin ? { onRowClick: openEdit } : {})}
            mobileTitle={(row) => row.fullName}
            mobileSubtitle={(row) => row.schoolName}
            caption="Registered delegates with school, contact, email, committee, country and attendance"
            emptyState={
              hasFilters ? (
                <EmptyState
                  icon={Search}
                  title="No delegates match those filters"
                  description="Try clearing the search box or widening the filters."
                  action={
                    <Button variant="secondary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={Users}
                  title="No delegates yet"
                  description={
                    isAdmin
                      ? 'Add them one at a time, import a CSV, or let the registration form feed them in automatically.'
                      : 'The secretariat has not added any delegates yet.'
                  }
                  action={
                    isAdmin ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                          onClick={() => {
                            setEditing(null)
                            setFormOpen(true)
                          }}
                        >
                          <Plus size={16} aria-hidden />
                          Add delegate
                        </Button>
                        <Button variant="secondary" onClick={() => setImportOpen(true)}>
                          <Upload size={16} aria-hidden />
                          Import CSV
                        </Button>
                      </div>
                    ) : undefined
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
            noun="delegates"
          />
        </>
      )}

      {isAdmin ? (
        <>
          <DelegateForm open={formOpen} onOpenChange={setFormOpen} delegate={editing} />
          <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
          <ConfirmDialog
            open={pendingDelete !== null}
            onOpenChange={(open) => !open && setPendingDelete(null)}
            title="Delete delegate?"
            description={
              pendingDelete
                ? `Delete ${pendingDelete.fullName} from ${pendingDelete.schoolName}? Their country is released. This cannot be undone.`
                : ''
            }
            onConfirm={() => void confirmDelete()}
            loading={remove.isPending}
          />
        </>
      ) : null}
    </>
  )
}
