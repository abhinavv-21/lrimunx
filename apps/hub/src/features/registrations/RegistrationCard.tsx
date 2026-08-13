import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Check, Eye, ImageOff, Mail, Phone, School, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { cn, munExperience } from '@/lib/utils'
import type { Registration } from '@/types/api'

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
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')

  async function reveal() {
    if (state === 'loading') return
    setState('loading')
    try {
      const res = await apiFetch<{ url: string }>(`/registrations/${registrationId}/payment-proof`)
      setUrl(res.url)
      setState('idle')
    } catch {
      setState('failed')
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
            <Button variant="ghost" size="sm" onClick={reveal} disabled={state === 'loading'}>
              <Eye size={14} aria-hidden />
              {state === 'loading' ? 'Opening…' : 'View screenshot'}
            </Button>
            {state === 'failed' && (
              <span className="text-body-sm text-danger">
                Could not load it. The link is signed and short-lived — try again.
              </span>
            )}
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
  onDelete,
}: {
  registration: Registration
  isAdmin: boolean
  busy: boolean
  onApprove: (registration: Registration) => void
  onReject: (registration: Registration) => void
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
          hasProof={Boolean(registration.paymentProofUrl)}
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
