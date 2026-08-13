import { useMemo, useState } from 'react'
import { Eraser, FileClock } from 'lucide-react'
import { useAuditLog, useClearAuditLog } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar, SearchField } from '@/components/ui/FilterBar'
import { Field } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States'
import { formatDateTime, humanise, pluralise } from '@/lib/utils'

const ACTION_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  CHECK_IN: 'success',
  IMPORT: 'info',
  EXPORT: 'neutral',
  RESOLVE: 'success',
  CLEAR: 'danger',
}

const RECORD_TYPES: SelectOption[] = [
  { value: '', label: 'All records' },
  { value: 'Delegate', label: 'Delegate' },
  { value: 'Committee', label: 'Committee' },
  { value: 'Assignment', label: 'Assignment' },
  { value: 'LogisticsReq', label: 'Logistics request' },
  { value: 'User', label: 'User' },
]

export function AuditPage() {
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [clearOpen, setClearOpen] = useState(false)

  const clear = useClearAuditLog()
  const toast = useToast()

  const filters = useMemo(
    () => ({ ...(search ? { search } : {}), ...(entityType ? { entityType } : {}) }),
    [search, entityType],
  )

  const { data, isPending, isError, error, refetch } = useAuditLog(filters)

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made by an admin, and every attendance check-in, with before and after."
        actions={
          data && data.total > 0 ? (
            <Button variant="secondary" onClick={() => setClearOpen(true)}>
              <Eraser size={16} aria-hidden />
              Clear history
            </Button>
          ) : null
        }
      />

      <FilterBar>
        <SearchField value={search} onChange={setSearch} placeholder="Person, action or record type" />

        <Field label="Record type">
          {({ id }) => (
            <Select id={id} value={entityType} onChange={setEntityType} options={RECORD_TYPES} />
          )}
        </Field>
      </FilterBar>

      {isPending ? (
        <SkeletonRows rows={10} columns={4} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={FileClock}
          title={search || entityType ? 'No entries match' : 'Nothing recorded yet'}
          description={
            search || entityType
              ? 'Try a different search term or record type.'
              : 'Admin changes and attendance check-ins will appear here as they happen.'
          }
          action={
            search || entityType ? (
              <Button variant="secondary" onClick={() => { setSearch(''); setEntityType('') }}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-3 font-mono text-data text-ink-secondary" aria-live="polite">
            {data.total} {data.total === 1 ? 'entry' : 'entries'}
          </p>

          <ul className="flex flex-col gap-2">
            {data.items.map((entry) => {
              const isOpen = expanded === entry.id
              return (
                <li key={entry.id} className="rounded-card border border-edge bg-surface">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    aria-expanded={isOpen}
                    className="flex min-h-tap w-full flex-wrap items-center gap-3 p-4 text-left transition-colors duration-micro hover:bg-surface-sunken md:min-h-row"
                  >
                    <Badge tone={ACTION_TONE[entry.action] ?? 'neutral'}>{humanise(entry.action)}</Badge>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-ink">
                        {entry.user.fullName} · {entry.entityType}
                      </p>
                      <p className="truncate font-mono text-data text-ink-secondary">{entry.entityId}</p>
                    </div>

                    <span className="shrink-0 font-mono text-data text-ink-secondary">
                      {formatDateTime(entry.timestamp)}
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="border-t border-edge p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="text-label uppercase text-ink-secondary">Before</p>
                          <pre className="table-scroll mt-2 max-h-64 rounded-control bg-surface-sunken p-3 font-mono text-data text-ink">
                            {entry.payloadBefore ? JSON.stringify(entry.payloadBefore, null, 2) : '—'}
                          </pre>
                        </div>
                        <div>
                          <p className="text-label uppercase text-ink-secondary">After</p>
                          <pre className="table-scroll mt-2 max-h-64 rounded-control bg-surface-sunken p-3 font-mono text-data text-ink">
                            {entry.payloadAfter ? JSON.stringify(entry.payloadAfter, null, 2) : '—'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear activity history?"
        description={
          data
            ? `This permanently deletes ${pluralise(data.total, 'entry', 'entries')} and cannot be undone. One entry will remain, recording that you cleared the log.`
            : ''
        }
        confirmLabel="Clear history"
        loading={clear.isPending}
        onConfirm={() => {
          clear
            .mutateAsync()
            .then((result) => {
              toast.success('History cleared', `${pluralise(result.deleted, 'entry', 'entries')} removed.`)
              setClearOpen(false)
            })
            .catch((caught: unknown) => {
              toast.error('Could not clear history', caught instanceof Error ? caught.message : undefined)
            })
        }}
      />
    </>
  )
}
