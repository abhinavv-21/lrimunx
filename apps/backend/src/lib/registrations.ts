import { randomInt } from 'node:crypto'
import { RegistrationStatus } from '@prisma/client'

export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export const REFERENCE_PREFIX = 'LMX-'

export const REFERENCE_LENGTH = 6

export const REFERENCE_PATTERN = new RegExp(`^${REFERENCE_PREFIX}[${REFERENCE_ALPHABET}]{${REFERENCE_LENGTH}}$`)

export function generateReference(): string {
  let code = ''
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]
  }
  return `${REFERENCE_PREFIX}${code}`
}

export const LIVE_REGISTRATION_STATUSES: readonly RegistrationStatus[] = [
  RegistrationStatus.PENDING,
  RegistrationStatus.APPROVED,
]

export type ReviewAction = 'approve' | 'reject'

export interface TransitionCheck {
  allowed: boolean

  reason?: string
}

export function checkReviewTransition(status: RegistrationStatus, action: ReviewAction): TransitionCheck {
  if (status === RegistrationStatus.PENDING) return { allowed: true }

  if (status === RegistrationStatus.APPROVED) {
    return {
      allowed: false,
      reason:
        action === 'approve'
          ? 'This registration has already been approved and its delegate exists.'
          : 'This registration was already approved. Delete the delegate it created before rejecting it.',
    }
  }

  return {
    allowed: false,
    reason:
      action === 'approve'
        ? 'This registration was rejected. Ask the applicant to submit a new registration rather than reversing the decision.'
        : 'This registration has already been rejected.',
  }
}

export function isHoneypotTripped(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0
}
