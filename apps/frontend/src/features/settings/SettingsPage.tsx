import { PageHeader } from '@/components/ui/PageHeader'
import { DangerZone } from './DangerZone'

/**
 * Settings.
 *
 * This screen used to be Integrations: a Google Form link, a responses-sheet
 * link, and the Apps Script webhook that turned each submission into a
 * delegate. None of it is reachable any more — registration happens on the
 * conference site itself and lands in the review queue directly, so the form
 * being pointed at was a form nobody fills in and the webhook was a door into a
 * path nothing walks.
 *
 * The CSV import is NOT part of that and has not gone anywhere; it lives on the
 * Delegates screen, where the thing being imported is.
 *
 * What is left is the reset, which needed somewhere to live.
 */
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
