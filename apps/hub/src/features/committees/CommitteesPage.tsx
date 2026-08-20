import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Landmark, Pencil, Plus, Trash2, Trophy, Upload } from 'lucide-react'
import { useIsAdmin } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { useCommittees, useDeleteCommittee, useSaveCommittee } from '@/lib/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Callout } from '@/components/ui/Callout'
import { Button } from '@/components/ui/Button'
import { Card, CapacityMeter } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { CONFIRM_PHRASE, ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, SkeletonCards } from '@/components/ui/States'
import { ApiError, errorMessage } from '@/lib/api'
import { MatrixImportDialog } from './MatrixImportDialog'
import type { Committee } from '@/types/api'

function CommitteeForm({
  open,
  onOpenChange,
  committee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  committee: Committee | null
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [totalSeats, setTotalSeats] = useState('15')
  const [error, setError] = useState<string | null>(null)
  const save = useSaveCommittee()
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setName(committee?.name ?? '')
    setCode(committee?.code ?? '')
    setTotalSeats(String(committee?.totalSeats ?? 15))
    setError(null)
  }, [open, committee])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    try {
      await save.mutateAsync({
        ...(committee ? { id: committee.id } : {}),
        name: name.trim(),
        code: code.trim().toUpperCase(),
        totalSeats: Number(totalSeats),
      })
      toast.success(committee ? 'Committee updated' : 'Committee created', code.toUpperCase())
      onOpenChange(false)
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save this committee.'))
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={committee ? 'Edit committee' : 'New committee'}
      description={committee ? undefined : 'Seats determine how many delegates can be assigned.'}
      holdsInput
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error ? (
          <Callout tone="danger" alert>
            {error}
          </Callout>
        ) : null}

        <Field label="Full name" required>
          {({ id }) => (
            <Input
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="United Nations Security Council"
              required
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="Short form used across the app." required>
            {({ id }) => (
              <Input
                id={id}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="UNSC"
                maxLength={16}
                required
                className="font-mono"
              />
            )}
          </Field>
          <Field label="Total seats" required>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={500}
                value={totalSeats}
                onChange={(event) => setTotalSeats(event.target.value)}
                required
                className="font-mono"
              />
            )}
          </Field>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {committee ? 'Save changes' : 'Create committee'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function CommitteesPage() {
  const toast = useToast()
  const isAdmin = useIsAdmin()

  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Committee | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Committee | null>(null)

  const { data, isPending, isError, error, refetch } = useCommittees()
  const remove = useDeleteCommittee()

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await remove.mutateAsync(pendingDelete.id)
      toast.success('Committee deleted', pendingDelete.code)
      setPendingDelete(null)
    } catch (caught) {
      toast.error('Could not delete', caught instanceof ApiError ? caught.message : undefined)
    }
  }

  return (
    <>
      <PageHeader
        title="Committees"
        description="Rooms, seat counts and how full each one is. Open one for its delegates, country matrix, requests and awards."
        actions={
          isAdmin ? (
            <>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload size={16} aria-hidden />
                Import matrix CSV
              </Button>
              <Button
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus size={16} aria-hidden />
                New committee
              </Button>
            </>
          ) : null
        }
      />

      {isPending ? (
        <SkeletonCards count={6} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No committees yet"
          description={
            isAdmin
              ? 'Create the committees first — delegates cannot be assigned a country until a room exists.'
              : 'The secretariat has not set up the committees yet.'
          }
          action={
            isAdmin ? (
              <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
                <Plus size={16} aria-hidden />
                New committee
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((committee) => (
            <li key={committee.id}>

              <Card className="relative flex h-full flex-col transition-colors duration-micro hover:border-edge-strong focus-within:border-edge-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/committees/${committee.id}`}
                      className="font-heading text-h2 text-ink underline-offset-4 after:absolute after:inset-0 after:rounded-card hover:underline"
                    >
                      {committee.code}
                    </Link>
                    <p className="mt-1 text-body-sm text-ink-secondary">{committee.name}</p>
                  </div>
                  {isAdmin ? (
                    <div className="relative z-10 flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${committee.code}`}
                        onClick={() => { setEditing(committee); setFormOpen(true) }}
                      >
                        <Pencil size={16} aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${committee.code}`}
                        onClick={() => setPendingDelete(committee)}
                      >
                        <Trash2 size={16} aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">
                  {committee.openRequests ? (
                    <span className="flex items-center gap-1.5 text-warning">
                      <ClipboardList size={14} aria-hidden />
                      {committee.openRequests} open {committee.openRequests === 1 ? 'request' : 'requests'}
                    </span>
                  ) : null}
                  {committee.awardCount ? (
                    <span className="flex items-center gap-1.5 text-ink-secondary">
                      <Trophy size={14} aria-hidden />
                      {committee.awardCount} {committee.awardCount === 1 ? 'award' : 'awards'}
                    </span>
                  ) : null}
                </div>

                <div className="mt-auto pt-5">
                  <CapacityMeter filled={committee.filledSeats} total={committee.totalSeats} />
                  <p className="mt-2 text-body-sm text-ink-secondary">
                    {committee.seatsRemaining > 0
                      ? `${committee.seatsRemaining} seats open`
                      : 'Full — no seats remaining'}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {isAdmin ? (
        <>
          <CommitteeForm open={formOpen} onOpenChange={setFormOpen} committee={editing} />
          <MatrixImportDialog open={importOpen} onOpenChange={setImportOpen} />
          <ConfirmDialog
            open={pendingDelete !== null}
            onOpenChange={(open) => !open && setPendingDelete(null)}
            title={
              pendingDelete && pendingDelete.filledSeats > 0
                ? 'This committee still has delegates in it'
                : 'Delete committee?'
            }

            description={
              !pendingDelete
                ? ''
                : pendingDelete.filledSeats > 0
                  ? `${pendingDelete.filledSeats} ${pendingDelete.filledSeats === 1 ? 'delegate is' : 'delegates are'} allocated to ${pendingDelete.code} — ${pendingDelete.name}, so deleting it will be refused. Move them to another committee in Allocations first.`
                  : `Delete ${pendingDelete.code} — ${pendingDelete.name}? Its country matrix and awards go with it. This cannot be undone.`
            }
            confirmPhrase={CONFIRM_PHRASE}
            onConfirm={() => void confirmDelete()}
            loading={remove.isPending}
          />
        </>
      ) : null}
    </>
  )
}
