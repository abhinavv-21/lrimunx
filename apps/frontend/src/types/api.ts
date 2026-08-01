/** Shapes mirroring the backend API. Kept explicit — `any` is banned. */

export type Role = 'ADMIN' | 'CONTRIBUTOR'
export type AttendanceStatus = 'ABSENT' | 'CHECKED_IN'
export type RequestCategory = 'PLACARD' | 'STATIONERY' | 'AWARDS' | 'LOGISTICS'
export type RequestStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'

export interface ApiErrorBody {
  error: string
  code: number
  details?: unknown
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AuthUser {
  id: string
  username: string
  fullName: string
  role: Role
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export interface CommitteeRef {
  id: string
  name: string
  code: string
}

/** A country already spoken for in a committee, and by whom. */
export interface TakenCountry {
  country: string
  delegateId: string
  delegateName: string
}

export interface Committee extends CommitteeRef {
  totalSeats: number
  filledSeats: number
  seatsRemaining: number
  /** Unresolved requests only — resolved ones are not a call to action. */
  openRequests?: number
  awardCount?: number
  /** Present on the list endpoint; drives the clash warning in Allocations. */
  takenCountries?: TakenCountry[]
}

/** One seat in a committee: the country and whoever holds it. */
export interface CommitteeSeat {
  id: string
  country: string
  delegate: {
    id: string
    fullName: string
    schoolName: string
    email: string
    phone: string
    attendanceStatus: AttendanceStatus
  }
}

export interface Award {
  id: string
  title: string
  /** Ceremony order, derived server-side from the title. Lower is announced later. */
  rank: number
  note: string | null
  createdAt: string
  updatedAt: string
  /** Null while the award is a decided slot with no winner chosen yet. */
  delegate: { id: string; fullName: string; schoolName: string } | null
}

export interface AwardInput {
  title: string
  delegateId: string | null
  note: string | null
}

export interface CommitteeDetail extends Committee {
  assignments: CommitteeSeat[]
  requests: LogisticsRequest[]
  awards: Award[]
  /** Every request ever filed against this room, resolved included. */
  totalRequests: number
}

export interface DelegateAssignment {
  id: string
  country: string
  updatedAt: string
  committee: CommitteeRef
}

export interface Delegate {
  id: string
  fullName: string
  email: string
  phone: string
  schoolName: string
  grade: string
  /**
   * What the delegate asked for on the registration form. Surfaced only on the
   * Allocations screen — everywhere else, the placement is what matters.
   */
  committeePreference: string | null
  /** The fallback they named, read when the first choice is full. */
  committeePreference2: string | null
  /** Prior experience, as answered on the form. Null means they did not say. */
  munsAttended: number | null
  awardsWon: number | null
  dietaryNotes: string | null
  accessibilityNotes: string | null
  attendanceStatus: AttendanceStatus
  assignment: DelegateAssignment | null
  createdAt: string
  updatedAt: string
}

/** Payload for creating or editing a delegate, including their placement. */
export interface DelegateInput {
  fullName: string
  email: string
  phone: string
  schoolName: string
  grade: string
  committeePreference: string | null
  committeePreference2: string | null
  munsAttended: number | null
  awardsWon: number | null
  dietaryNotes: string | null
  accessibilityNotes: string | null
  committeeId: string | null
  country: string | null
}

export interface Assignment {
  id: string
  country: string
  updatedAt: string
  delegate: { id: string; fullName: string; schoolName: string; attendanceStatus: AttendanceStatus }
  committee: { id: string; name: string; code: string; totalSeats: number }
  assignedBy: { id: string; fullName: string }
}

export interface LogisticsRequest {
  id: string
  title: string
  category: RequestCategory
  description: string
  status: RequestStatus
  createdAt: string
  updatedAt: string
  committee: CommitteeRef | null
  createdBy: { id: string; fullName: string }
  resolvedBy: { id: string; fullName: string } | null
  /** Present when the server collapsed a replayed offline submission. */
  deduplicated?: boolean
}

export type RegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

/**
 * A submission from the public website, before it is anyone in the roster.
 *
 * A registration is never a user account. Approving one creates a Delegate —
 * it grants no access to this hub at all.
 */
export interface Registration {
  id: string
  /** Human-quotable code the applicant was shown, e.g. LMX-7Q4H2M. */
  reference: string
  fullName: string
  email: string
  phone: string
  schoolName: string
  grade: string
  committeePreference: string | null
  committeePreference2: string | null
  munsAttended: number | null
  awardsWon: number | null
  /** Free text — whoever or whatever the applicant said pointed them here. */
  referralCode: string | null
  /**
   * The payment screenshot on Vercel Blob. Server-validated as a URL on the
   * blob host, so it is safe to render as a link; null when none was attached.
   */
  paymentProofUrl: string | null
  dietaryNotes: string | null
  accessibilityNotes: string | null
  status: RegistrationStatus
  rejectionReason: string | null
  reviewedAt: string | null
  reviewedBy: { id: string; fullName: string } | null
  delegateId: string | null
  createdAt: string
}

export interface RegistrationStats {
  pending: number
  approved: number
  rejected: number
  total: number
}

export interface AuditEntry {
  id: string
  action: string
  entityType: string
  entityId: string
  payloadBefore: unknown
  payloadAfter: unknown
  timestamp: string
  user: { id: string; fullName: string; username?: string; role?: Role }
}

export interface AttendanceSummary {
  checkedIn: number
  absent: number
  total: number
  committees: Array<{
    id: string
    code: string
    name: string
    assigned: number
    checkedIn: number
    totalSeats: number
  }>
}

export interface DashboardData {
  role: Role
  totalDelegates: number
  checkedIn: number
  absent: number
  openRequests: number
  inProgressRequests: number
  capacity: Array<{
    id: string
    code: string
    name: string
    totalSeats: number
    filledSeats: number
    seatsRemaining: number
  }>
  recentRequests: Array<{
    id: string
    title: string
    category: RequestCategory
    status: RequestStatus
    createdAt: string
    committee: { code: string } | null
  }>
  /** ADMIN-only fields. */
  unassigned?: number
  recentAudit?: Array<{
    id: string
    action: string
    entityType: string
    entityId: string
    timestamp: string
    user: { fullName: string }
  }>
}

export interface IngestResult {
  created: number
  updated: number
  skipped: number
  issues: Array<{ row: number; email?: string; reason: string }>
  phoneCollisions: Array<{ phone: string; emails: string[] }>
}

export interface Settings {
  googleFormUrl: string
  googleSheetUrl: string
}

/** What a conference reset removed, or would remove. Accounts are never included. */
export interface ResetCounts {
  awards: number
  assignments: number
  registrations: number
  logisticsRequests: number
  delegates: number
  committees: number
}

export interface ResetPreview {
  deleted: ResetCounts
  total: number
  /** False when the server has no passphrase set, which disables the feature. */
  configured: boolean
}

export interface ResetResult {
  deleted: ResetCounts
  total: number
}
