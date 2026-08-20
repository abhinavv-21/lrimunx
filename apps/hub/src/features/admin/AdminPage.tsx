import { PageHeader } from '@/components/ui/PageHeader'
import { AnnouncementSection } from './AnnouncementSection'
import { AuditLogSection } from './AuditLogSection'
import { ConferenceDetails } from './ConferenceDetails'
import { DangerZone } from './DangerZone'
import { PricingSection } from './PricingSection'

/*
 * Five unrelated jobs on one page: the conference record, what it charges, the
 * one mailshot that cannot be taken back, the log of who changed what, and the
 * two buttons that empty everything. They are here together because they are
 * all the owner's and nobody else's, not because they belong to each other, so
 * each one gets its own card and the list at the top jumps between them rather
 * than making anyone scroll past four sections to reach the fifth.
 */
const SECTIONS = [
  { id: 'conference', label: 'Conference' },
  { id: 'prices', label: 'Prices' },
  { id: 'allocation-emails', label: 'Allocation emails' },
  { id: 'audit-log', label: 'Audit log' },
  { id: 'danger-zone', label: 'Danger zone' },
]

export function AdminPage() {
  return (
    <>
      <PageHeader
        title="Admin"
        description="The conference record, what a delegate pays, the allocation emails and the log of every change. Only you can open this page."
      />

      <nav aria-label="Sections of this page" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-tap items-center rounded-pill border border-edge-strong bg-surface px-3 text-body-sm text-ink-secondary transition-colors duration-micro hover:bg-surface-sunken hover:text-ink md:min-h-9"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-8">
        <div id="conference" className="scroll-mt-6">
          <ConferenceDetails />
        </div>
        <div id="prices" className="scroll-mt-6">
          <PricingSection />
        </div>
        <div id="allocation-emails" className="scroll-mt-6">
          <AnnouncementSection />
        </div>
        <div id="audit-log" className="scroll-mt-6">
          <AuditLogSection />
        </div>
        <div id="danger-zone" className="scroll-mt-6">
          <DangerZone />
        </div>
      </div>
    </>
  )
}
