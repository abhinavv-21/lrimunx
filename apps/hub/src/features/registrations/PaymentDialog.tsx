import { Modal } from '@/components/ui/Modal'
import { PaymentFields, type Payable } from './PaymentFields'

/**
 * The registrations queue's way in to recording a payment. The fields
 * themselves are shared with the delegate form (see PaymentFields); all this
 * adds is the dialog around them.
 */
export function PaymentDialog({
  registration,
  onOpenChange,
}: {
  registration: (Payable & { fullName: string }) | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Modal
      open={registration !== null}
      onOpenChange={onOpenChange}
      title={registration?.amountPaid === null ? 'Record a payment' : 'Update the payment'}
      description={
        registration
          ? `What ${registration.fullName} was charged, and what actually arrived. It feeds the budget straight away.`
          : ''
      }
      holdsInput
    >
      {registration ? (
        <PaymentFields
          payable={registration}
          payerName={registration.fullName}
          onRecorded={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      ) : null}
    </Modal>
  )
}
