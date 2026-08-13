import { PageHeader } from '@/components/ui/PageHeader'
import { DangerZone } from './DangerZone'

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Conference-wide controls. Handle with care."
      />

      <DangerZone />
    </>
  )
}
