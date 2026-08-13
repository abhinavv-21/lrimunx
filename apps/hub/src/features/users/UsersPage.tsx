import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2, UsersRound } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { useDeleteUser, useSaveUser, useUsers } from '@/lib/hooks'
import { ApiError, errorMessage } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { RoleBadge } from '@/components/ui/Badge'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States'
import { formatDateTime } from '@/lib/utils'
import type { AuthUser } from '@/types/api'

type UserRow = AuthUser & { createdAt: string }

const ROLES: SelectOption[] = [
  { value: 'CONTRIBUTOR', label: 'Contributor', hint: 'Raises requests, checks delegates in' },
  { value: 'ADMIN', label: 'Admin', hint: 'Runs the conference' },
]

function UserForm({
  open,
  onOpenChange,
  user,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserRow | null
}) {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('CONTRIBUTOR')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useSaveUser()
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setUsername(user?.username ?? '')
    setFullName(user?.fullName ?? '')
    setRole(user?.role ?? 'CONTRIBUTOR')
    setPassword('')
    setError(null)
  }, [open, user])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    try {
      await save.mutateAsync(
        user
          ? { id: user.id, fullName: fullName.trim(), role, ...(password ? { password } : {}) }
          : { username: username.trim(), fullName: fullName.trim(), role, password },
      )
      toast.success(user ? 'Account updated' : 'Account created', fullName.trim())
      onOpenChange(false)
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save this account.'))
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={user ? 'Edit account' : 'New account'}
      description={
        user
          ? 'Leave the password blank to keep the current one.'
          : 'Contributors can raise logistics requests and check delegates in. Admins can do everything.'
      }
      holdsInput
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error ? (
          <p role="alert" className="rounded-control border border-danger bg-danger-wash p-3 text-body-sm text-ink">
            {error}
          </p>
        ) : null}

        {user ? null : (
          <Field label="Username" hint="Letters, numbers, dot, underscore or hyphen." required>
            {({ id }) => (
              <Input
                id={id}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            )}
          </Field>
        )}

        <Field label="Full name" required>
          {({ id }) => (
            <Input id={id} value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          )}
        </Field>

        <Field label="Role" required>
          {({ id, describedBy }) => (
            <Select id={id} value={role} onChange={setRole} options={ROLES} aria-describedby={describedBy} />
          )}
        </Field>

        <Field
          label={user ? 'New password' : 'Password'}
          hint="At least 10 characters."
          required={!user}
        >
          {({ id }) => (
            <Input
              id={id}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={10}
              required={!user}
            />
          )}
        </Field>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {user ? 'Save changes' : 'Create account'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const toast = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null)

  const { data, isPending, isError, error, refetch } = useUsers()
  const remove = useDeleteUser()

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await remove.mutateAsync(pendingDelete.id)
      toast.success('Account deleted', pendingDelete.fullName)
      setPendingDelete(null)
    } catch (caught) {
      toast.error('Could not delete', caught instanceof ApiError ? caught.message : undefined)
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in, and what they are allowed to do."
        actions={
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Plus size={16} aria-hidden />
            New account
          </Button>
        }
      />

      {isPending ? (
        <SkeletonRows rows={5} columns={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No accounts yet"
          description="Create an account for each member of the secretariat and each floor volunteer."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((account) => {
            const isSelf = account.id === currentUser?.id
            return (
              <li key={account.id}>
                <Card className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">
                      {account.fullName}
                      {isSelf ? <span className="ml-2 text-body-sm text-ink-secondary">(you)</span> : null}
                    </p>
                    <p className="truncate font-mono text-data text-ink-secondary">
                      {account.username} · joined {formatDateTime(account.createdAt)}
                    </p>
                  </div>

                  <RoleBadge role={account.role} />

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${account.fullName}`}
                      onClick={() => { setEditing(account); setFormOpen(true) }}
                    >
                      <Pencil size={16} aria-hidden />
                    </Button>

                    {isSelf ? null : (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${account.fullName}`}
                        onClick={() => setPendingDelete(account)}
                      >
                        <Trash2 size={16} aria-hidden />
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <UserForm open={formOpen} onOpenChange={setFormOpen} user={editing} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete account?"
        description={
          pendingDelete
            ? `Delete the account for ${pendingDelete.fullName} (${pendingDelete.username})? Accounts with activity history cannot be deleted — change the role to Contributor instead.`
            : ''
        }
        onConfirm={() => void confirmDelete()}
        loading={remove.isPending}
      />
    </>
  )
}
