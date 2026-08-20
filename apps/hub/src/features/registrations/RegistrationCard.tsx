import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Check, Eye, ImageOff, Mail, Phone, School, Trash2, Wallet, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ApiError, apiFetch, errorMessage } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { cn, munExperience } from '@/lib/utils'
import { TIER_LABELS, formatMoney } from '@/features/budget/money'
import type { Registration } from '@/types/api'

/** Tier and amount on one line, so the list can be read without opening a card. */
function PaymentSummary({ registration }: { registration: Registration }) {
  if (registration.amountPaid === null) {
    return <span className="text-ink-tertiary">No payment recorded</span>
  }

  return (
    <span className="text-ink">
      {registration.priceTier ? `${TIER_LABELS[registration.priceTier]} · ` : 'Tier not set · '}
      {formatMoney(registration.amountPaid)}
    </span>
  )
}

function StatusBadge({ status }: { status: Registration['status'] }) {
  if (status === 'APPROVED') return <Badge tone="success" icon={Check}>Approved</Badge>
  if (status === 'REJECTED') return <Badge tone="neutral" icon={X}>Rejected</Badge>
  return <Badge tone="warning" icon={Mail}>Pending</Badge>
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <dt className="text-label uppercase text-ink-secondary">{label}</dt>
      <dd className="mt-0.5 break-words text-body-sm text-ink">{value}</dd>
    </div>
  )
}

/**
 * Why the screenshot would not open, in words the reviewer can act on.
 *
 * The 5xx case is the one that matters day to day: object storage is optional
 * on a deployment, and on a machine without it the endpoint fails rather than
 * returning a link. That is a missing setting, not a broken registration, and
 * the copy has to say so or every proof looks corrupt.
 */
function proofFailure(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isOffline) return caught.message
    if (caught.code >= 500) {
      return 'The screenshot store is not set up on this server, so nothing can be opened here. Ask them to send it another way.'
    }
    if (caught.code === 404) return 'There is no screenshot on this registration.'
  }
  return errorMessage(caught, 'The link could not be signed. Try again in a moment.')
}

function PaymentProof({
  registrationId,
  hasProof,
  applicantName,
}: {
  registrationId: string
  hasProof: boolean
  applicantName: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function reveal() {
    if (loading) return
    setLoading(true)
    setFailure(null)
    try {
      const res = await apiFetch<{ url: string }>(`/registrations/${registrationId}/payment-proof`)
      setUrl(res.url)
    } catch (caught) {
      setFailure(proofFailure(caught))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-w-0">
      <dt className="text-label uppercase text-ink-secondary">Payment proof</dt>
      <dd className="mt-0.5">
        {!hasProof ? (
          <span className="flex items-center gap-1.5 text-body-sm text-ink-secondary">
            <ImageOff size={14} className="shrink-0 text-ink-tertiary" aria-hidden />
            No payment proof
          </span>
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center gap-2 text-body-sm text-ink underline-offset-2 hover:underline"
          >
            <img
              src={url}
              alt={`Payment screenshot submitted by ${applicantName}`}
              className="h-12 w-12 shrink-0 border border-edge object-cover"
            />
            Open full size
          </a>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <Button variant="ghost" size="sm" onClick={() => void reveal()} disabled={loading}>
              <Eye size={14} aria-hidden />
              {loading ? 'Opening…' : failure ? 'Try again' : 'View screenshot'}
            </Button>
            {failure ? <span className="text-body-sm text-danger">{failure}</span> : null}
          </div>
        )}
      </dd>
    </div>
  )
}

export function RegistrationCard({
  registration,
  isAdmin,
  busy,
  onApprove,
  onReject,
  onRecordPayment,
  onDelete,
}: {
  registration: Registration
  isAdmin: boolean
  busy: boolean
  onApprove: (registration: Registration) => void
  onReject: (registration: Registration) => void
  onRecordPayment: (registration: Registration) => void
  onDelete: (registration: Registration) => void
}) {
  const pending = registration.status === 'PENDING'
  const age = formatDistanceToNow(new Date(registration.createdAt), { addSuffix: true })

  return (
    <article
      className={cn(
        'rounded-card border bg-surface p-4 md:p-5',
        pending ? 'border-edge-strong' : 'border-edge',
        registration.status === 'REJECTED' && 'opacity-75',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-h3 text-ink">{registration.fullName}</h3>
            <span className="font-mono text-data text-ink-tertiary">{registration.reference}</span>
          </div>

          <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-ink-secondary">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">School</dt>
              <School size={14} className="shrink-0 text-ink-tertiary" aria-hidden />
              <dd className="text-ink">{registration.schoolName}</dd>
            </div>
            <div className="flex items-center gap-1.5">

              <dt className="sr-only">Academic level</dt>
              <dd>{registration.grade}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Submitted</dt>
              <dd>{age}</dd>
            </div>
          </dl>

          <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-data">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Email</dt>
              <Mail size={14} className="shrink-0 text-ink-tertiary" aria-hidden />
              <dd>
                <a href={`mailto:${registration.email}`} className="text-ink underline-offset-2 hover:underline">
                  {registration.email}
                </a>
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Phone</dt>
              <Phone size={14} className="shrink-0 text-ink-tertiary" aria-hidden />
              <dd>
                <a
                  href={`tel:${registration.phone.replace(/\s/g, '')}`}
                  className="text-ink underline-offset-2 hover:underline"
                >
                  {registration.phone}
                </a>
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Payment</dt>
              <Wallet size={14} className="shrink-0 text-ink-tertiary" aria-hidden />
              <dd>
                <PaymentSummary registration={registration} />
              </dd>
            </div>
          </dl>
        </div>

        <StatusBadge status={registration.status} />
      </div>

      <dl className="mt-3 grid gap-3 border-t border-edge pt-3 sm:grid-cols-3">
        <Detail label="First choice" value={registration.committeePreference} />
        <Detail label="Second choice" value={registration.committeePreference2} />
        <Detail
          label="Experience"
          value={munExperience(registration.munsAttended, registration.awardsWon)}
        />
        <Detail label="Referred by" value={registration.referralCode} />
        <Detail label="Dietary" value={registration.dietaryNotes} />
        <Detail label="Accessibility" value={registration.accessibilityNotes} />
        <PaymentProof
          registrationId={registration.id}
          hasProof={registration.hasPaymentProof}
          applicantName={registration.fullName}
        />
      </dl>

      {registration.status !== 'PENDING' ? (
        <p className="mt-3 border-t border-edge pt-3 text-body-sm text-ink-secondary">
          {registration.status === 'APPROVED' ? 'Approved' : 'Rejected'}
          {registration.reviewedBy ? ` by ${registration.reviewedBy.fullName}` : ''}
          {registration.reviewedAt
            ? ` ${formatDistanceToNow(new Date(registration.reviewedAt), { addSuffix: true })}`
            : ''}
          {registration.rejectionReason ? ` — ${registration.rejectionReason}` : ''}
        </p>
      ) : null}

      {isAdmin ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-4">
          {pending ? (
            <>
              <Button size="sm" loading={busy} onClick={() => onApprove(registration)}>
                <Check size={16} aria-hidden />
                Approve
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => onReject(registration)}>
                <X size={16} aria-hidden />
                Reject
              </Button>
            </>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onRecordPayment(registration)}
          >
            <Wallet size={16} aria-hidden />
            {registration.amountPaid === null ? 'Record payment' : 'Update payment'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={busy}
            onClick={() => onDelete(registration)}
          >
            <Trash2 size={16} aria-hidden />
            Delete
          </Button>
        </div>
      ) : null}
    </article>
  )
}
