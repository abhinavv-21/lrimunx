import { PageHeader } from '@/components/ui/PageHeader'
import { AuditLogSection } from '@/features/audit/AuditLogSection'
import { ConferenceDetails } from './ConferenceDetails'
import { DangerZone } from './DangerZone'

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="The details of the conference itself, the record of who changed what, and the one button that empties everything. Only you can open this page."
      />

      <div className="flex flex-col gap-6">
        <ConferenceDetails />
        <AuditLogSection />
        <DangerZone />
      </div>
    </>
  )
}
