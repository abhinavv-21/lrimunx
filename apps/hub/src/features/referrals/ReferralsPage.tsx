import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, HandCoins, Plus, Search, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { useCreateReferral, useDeleteReferral, useReferrals, useUpdateReferral } from '@/lib/hooks'
import { useToast } from '@/providers/ToastProvider'
import { errorMessage } from '@/lib/api'
import { formatMoney } from '@/features/budget/money'
import { LedgerEntryDialog, type LedgerDraft } from '@/features/budget/LedgerEntryDialog'
import type { ReferralCode } from '@/types/api'

export function ReferralsPage() {
  const referrals = useReferrals()
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const items = referrals.data?.items ?? []
    const needle = search.trim().toLowerCase()
    if (needle === '') return items
    return items.filter(
      (item) =>
        item.code.toLowerCase().includes(needle) || item.ownerName.toLowerCase().includes(needle),
    )
  }, [referrals.data, search])

  if (referrals.isLoading) return <PageSkeleton />
  if (referrals.isError) {
    return <ErrorState error={referrals.error} onRetry={() => void referrals.refetch()} />
  }

  const { rates, unmatched } = referrals.data!
  const items = referrals.data!.items

  const owed = items.reduce((total, item) => total + item.tally.payable, 0)
  const brought = items.reduce((total, item) => total + item.tally.outside + item.tally.house, 0)

  return (
    <>
      <PageHeader
        title="Referrals"
        description={`Rs ${rates.outside} for each delegate from outside the school, Rs ${rates.house} for an internal or alumni one, paid once a referrer has brought ${rates.quota} from outside.`}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden />
            Add a code
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Codes" value={String(items.length)} />
        <Stat label="Delegates brought in" value={String(brought)} />
        <Stat label="Owed to referrers" value={formatMoney(owed)} tone={owed > 0 ? 'accent' : undefined} />
      </div>

      {items.length > 0 ? (
        <div className="mt-6">
          <label className="relative block max-w-sm">
            <span className="sr-only">Search codes and referrers</span>
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Code or name"
              className="pl-9"
            />
          </label>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-4">
        {items.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No referral codes yet"
            description="Add a code and give it to whoever is handing it out. Anyone who has already typed it into the registration form is credited to them straight away."
            action={<Button onClick={() => setAdding(true)}>Add the first code</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nothing matches that"
            description="No code or referrer name contains what you typed."
          />
        ) : (
          filtered.map((item) => <ReferralRow key={item.id} item={item} rates={rates} />)
        )}
      </div>

      {unmatched.length > 0 ? <Unmatched rows={unmatched} /> : null}

      <AddDialog open={adding} onOpenChange={setAdding} />
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'accent' }) {
  return (
    <Card className="p-5">
      <p className="text-label uppercase text-ink-secondary">{label}</p>
      <p
        className={`mt-2 font-heading text-h1 tabular-nums ${tone === 'accent' ? 'text-accent' : 'text-ink'}`}
      >
        {value}
      </p>
    </Card>
  )
}

function ReferralRow({
  item,
  rates,
}: {
  item: ReferralCode
  rates: { outside: number; house: number; quota: number }
}) {
  const [open, setOpen] = useState(false)
  const [payout, setPayout] = useState<LedgerDraft | null>(null)
  const update = useUpdateReferral()
  const remove = useDeleteReferral()
  const toast = useToast()
  const { tally } = item

  const used = tally.outside + tally.house + tally.unpriced + tally.pending + tally.rejected

  async function toggleActive() {
    try {
      await update.mutateAsync({ id: item.id, active: !item.active })
      toast.success(item.active ? `${item.code} retired` : `${item.code} is live again`)
    } catch (caught) {
      toast.error('Could not change that code', errorMessage(caught))
    }
  }

  async function destroy() {
    try {
      await remove.mutateAsync(item.id)
      toast.success(`${item.code} deleted`)
    } catch (caught) {
      toast.error('Could not delete that code', errorMessage(caught))
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-data font-semibold uppercase tracking-wide text-ink">
              {item.code}
            </span>
            {item.active ? null : <Badge tone="neutral">Retired</Badge>}
            {tally.quotaMet ? <Badge tone="success">Quota met</Badge> : null}
          </div>
          <p className="mt-1 text-body text-ink">{item.ownerName}</p>
          {item.note ? <p className="mt-1 text-body-sm text-ink-secondary">{item.note}</p> : null}
        </div>

        <div className="text-right">
          <p className="font-heading text-h2 tabular-nums text-ink">{formatMoney(tally.earned)}</p>
          <p className="mt-0.5 text-body-sm text-ink-secondary">
            {tally.quotaMet ? (
              <span className="text-success">payable now</span>
            ) : (
              `${tally.quotaRemaining} more from outside to unlock`
            )}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-edge pt-4 sm:grid-cols-4">
        <Count label={`Outside · Rs ${rates.outside}`} value={tally.outside} />
        <Count label={`Internal or alumni · Rs ${rates.house}`} value={tally.house} />
        <Count label="Awaiting approval" value={tally.pending} muted />
        <Count label="Payment not recorded" value={tally.unpriced} muted />
      </dl>

      {tally.unpriced > 0 ? (
        <p className="mt-3 text-body-sm text-ink-secondary">
          {tally.unpriced === 1 ? 'One approved delegate has' : `${tally.unpriced} approved delegates have`}{' '}
          no price tier recorded, so {tally.unpriced === 1 ? 'it counts' : 'they count'} for nothing
          yet. Record the payment on the Registrations page and the total here follows.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {used > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen((current) => !current)}>
            {open ? 'Hide' : `Show ${used} ${used === 1 ? 'registration' : 'registrations'}`}
          </Button>
        ) : (
          <p className="text-body-sm text-ink-tertiary">Nobody has used this code yet.</p>
        )}

        <span className="flex-1" />

        {tally.payable > 0 ? (
          <Button
            size="sm"
            onClick={() =>
              setPayout({
                category: 'Referrals',
                particular: `Referral payout — ${item.ownerName} (${item.code})`,
                amount: tally.payable,
                direction: 'debit',
                note: `${tally.outside} from outside at Rs ${rates.outside}, ${tally.house} internal or alumni at Rs ${rates.house}.`,
              })
            }
          >
            <HandCoins size={16} aria-hidden />
            Record payout
          </Button>
        ) : null}

        <Button variant="secondary" size="sm" onClick={() => void toggleActive()} loading={update.isPending}>
          {item.active ? 'Retire' : 'Reactivate'}
        </Button>

        {used === 0 ? (
          <Button variant="ghost" size="sm" onClick={() => void destroy()} loading={remove.isPending}>
            <Trash2 size={16} aria-hidden />
            <span className="sr-only">Delete {item.code}</span>
          </Button>
        ) : null}
      </div>

      {/* The books are written by a person, not by a threshold being crossed.
          This fills the entry in and stops. */}
      <LedgerEntryDialog
        open={payout !== null}
        onOpenChange={(next) => {
          if (!next) setPayout(null)
        }}
        entry={null}
        draft={payout}
      />

      {open ? (
        <ul className="mt-4 flex flex-col gap-2 border-t border-edge pt-4">
          {item.registrations.map((registration) => (
            <li
              key={registration.id}
              className="flex flex-wrap items-baseline justify-between gap-2 text-body-sm"
            >
              <span className="text-ink">
                {registration.fullName}
                <span className="text-ink-tertiary"> · {registration.schoolName}</span>
              </span>
              <span className="flex items-center gap-2 text-ink-secondary">
                {/* What they typed, when it differs from the code it matched.
                    Worth showing: it is how you notice a code being published
                    with a space in it. */}
                {registration.referralCode &&
                registration.referralCode.toUpperCase().replace(/\s+/g, '') !== item.code ? (
                  <span className="font-mono text-ink-tertiary">
                    typed “{registration.referralCode}”
                  </span>
                ) : null}
                <span>{registration.priceTier ?? 'no tier yet'}</span>
                <Badge tone={registration.status === 'APPROVED' ? 'success' : registration.status === 'REJECTED' ? 'danger' : 'neutral'}>
                  {registration.status.toLowerCase()}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}

function Count({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <dt className="text-label uppercase text-ink-tertiary">{label}</dt>
      <dd className={`mt-1 font-heading text-h3 tabular-nums ${muted ? 'text-ink-secondary' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  )
}

/**
 * Codes people typed that match nothing.
 *
 * Every row here is someone who thought they were crediting a friend and was
 * not, so it is worth a section rather than a silent discard. Usually the code
 * simply has not been created yet — and creating it now adopts them.
 */
function Unmatched({ rows }: { rows: { key: string; typed: string[]; count: number }[] }) {
  return (
    <Card className="mt-6 border-warning bg-warning-wash p-5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-h3 text-ink">Codes nobody owns</h2>
          <p className="mt-1 text-body-sm text-ink-secondary">
            These were typed on the registration form and match no code here. Add the code and
            everyone who used it is credited straight away.
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.key} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-data font-semibold text-ink">{row.key}</span>
                <span className="text-body-sm text-ink-secondary">
                  {row.count} {row.count === 1 ? 'registration' : 'registrations'}
                  {row.typed.length > 1 ? ` · typed ${row.typed.length} different ways` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}

function AddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
  const create = useCreateReferral()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [note, setNote] = useState('')

  /**
   * Shown under the field as you type, so the normalising is visible rather
   * than a surprise after saving. Deliberately a preview and not a validator:
   * lower case and spaces are fine to type, and the server is the one that
   * decides whether the result is usable.
   */
  const preview = code.trim() === '' ? '' : code.normalize('NFKC').replace(/[‐-―]/g, '-').replace(/\s+/g, '').toUpperCase()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const result = await create.mutateAsync({
        code,
        ownerName,
        note: note.trim() === '' ? null : note.trim(),
      })
      toast.success(
        `${result.item.code} added`,
        result.adopted > 0
          ? `${result.adopted} ${result.adopted === 1 ? 'registration that had already typed it was' : 'registrations that had already typed it were'} credited to ${result.item.ownerName}.`
          : undefined,
      )
      setCode('')
      setOwnerName('')
      setNote('')
      onOpenChange(false)
    } catch (caught) {
      toast.error('Could not add that code', errorMessage(caught))
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add a referral code">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Code"
          required
          hint={
            preview && preview !== code
              ? `Saved as ${preview}. Capitals, spaces and dashes are ignored when a delegate types it.`
              : 'Capitals, spaces and dashes are ignored when a delegate types it.'
          }
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="RIDGE-MUNSOC"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby={describedBy}
              required
            />
          )}
        </Field>

        <Field label="Who it belongs to" required hint="As they should appear on a payout.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              placeholder="Full name"
              aria-describedby={describedBy}
              required
            />
          )}
        </Field>

        <Field label="Note" hint="Their school, how they are paid, who approved it. Optional.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Add code
          </Button>
        </div>
      </form>
    </Modal>
  )
}
