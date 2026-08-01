import { randomInt } from 'node:crypto'
import { RegistrationStatus } from '@prisma/client'

/**
 * Pure logic behind public registrations — reference codes and the rules
 * governing which review decisions are legal. Deliberately free of Prisma and
 * Express so both can be exercised without a database or a request.
 */

/**
 * Crockford-style alphabet with the characters people mistake for each other
 * removed: I/1 and O/0. A reference gets read down the phone and copied off a
 * screenshot, so "was that an O or a zero" is a real support cost.
 */
export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export const REFERENCE_PREFIX = 'LMX-'

/**
 * Six characters over a 32-symbol alphabet is ~1.07 billion codes. Long enough
 * that a code cannot be guessed into an existing application, short enough to
 * dictate in one breath.
 */
export const REFERENCE_LENGTH = 6

/** `LMX-` followed by exactly six characters drawn from the alphabet above. */
export const REFERENCE_PATTERN = new RegExp(`^${REFERENCE_PREFIX}[${REFERENCE_ALPHABET}]{${REFERENCE_LENGTH}}$`)

/**
 * Generates a submission reference.
 *
 * `randomInt` rather than `Math.random`: the reference is the only handle an
 * applicant holds on their own row, so a sequence an attacker could replay to
 * enumerate other people's applications is not acceptable.
 */
export function generateReference(): string {
  let code = ''
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]
  }
  return `${REFERENCE_PREFIX}${code}`
}

/** A registration in one of these states is still awaiting or already holds a place. */
export const LIVE_REGISTRATION_STATUSES: readonly RegistrationStatus[] = [
  RegistrationStatus.PENDING,
  RegistrationStatus.APPROVED,
]

export type ReviewAction = 'approve' | 'reject'

export interface TransitionCheck {
  allowed: boolean
  /** Present only when the transition is refused; safe to show an operator. */
  reason?: string
}

/**
 * Whether an OC member may apply `action` to a registration currently in
 * `status`.
 *
 * Only PENDING is reviewable. A decision that has already been taken is not
 * re-taken silently: approving twice would try to mint a second delegate, and
 * rejecting an approved application would leave a real Delegate row behind
 * with no application backing it. Both are conflicts the caller has to resolve
 * explicitly — by deleting the delegate, or by re-registering the applicant.
 */
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

/**
 * True when the honeypot field was filled in. Only a script that fills every
 * input touches it — the field is hidden from humans and from screen readers
 * on the website side.
 */
export function isHoneypotTripped(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0
}
