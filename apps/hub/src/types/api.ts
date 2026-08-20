export type Role = 'ADMIN' | 'CONTRIBUTOR'
export type AttendanceStatus = 'ABSENT' | 'CHECKED_IN'
export type RequestCategory = 'PLACARD' | 'STATIONERY' | 'AWARDS' | 'LOGISTICS'
export type RequestStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
export type ConferenceState = 'PREPARING' | 'RUNNING'
export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'

export interface ConferenceDay {
  day: number

  date: string
}

export interface ConferenceMode {
  state: ConferenceState

  activeDay: number
  days: ConferenceDay[]
}

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

  canManageUsers?: boolean

  isOwner?: boolean
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

export interface TakenCountry {
  country: string
  delegateId: string
  delegateName: string
}

export interface Committee extends CommitteeRef {
  totalSeats: number
  filledSeats: number
  seatsRemaining: number

  openRequests?: number
  awardCount?: number

  takenCountries?: TakenCountry[]

  matrixCountries?: string[]
}

export interface MatrixCountry {
  id: string
  country: string
  delegateId: string | null
  delegateName: string | null
}

export interface MatrixCommittee {
  id: string
  code: string
  name: string
  totalSeats: number
  countries: MatrixCountry[]

  offMatrix: Array<{ country: string; delegateId: string; delegateName: string }>
}

export interface MatrixImportResult {
  mode: 'merge' | 'replace'
  committees: string[]
  added: number
  removed: number
  unchanged: number

  kept: Array<{ committee: string; country: string; delegateName: string }>
  issues: Array<{ row: number; column?: string; reason: string }>
  longForm: boolean
}

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

  rank: number
  note: string | null
  createdAt: string
  updatedAt: string

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

  committeePreference: string | null

  committeePreference2: string | null

  munsAttended: number | null
  awardsWon: number | null
  dietaryNotes: string | null
  accessibilityNotes: string | null
  attendanceStatus: AttendanceStatus
  assignment: DelegateAssignment | null
  createdAt: string
  updatedAt: string
}

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

  day?: number | null

  priority?: number
  priorityLevel?: PriorityLevel

  deduplicated?: boolean
}

export interface LogisticsPage extends Paginated<LogisticsRequest> {
  priorityWindow?: number
}

export type RegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type PriceTier = 'BASE' | 'INTERNAL' | 'ALUMNI' | 'DISCOUNT'

/** What each tier charges, in whole Nepali rupees. */
export type TierPrices = Record<PriceTier, number>

export interface Registration {
  id: string

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

  referralCode: string | null

  paymentProofUrl: string | null

  hasPaymentProof: boolean

  priceTier: PriceTier | null

  amountPaid: number | null
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

export interface AttendanceDayTotals {
  day: number
  date: string
  checkedIn: number
  absent: number
}

export interface AttendanceSummary {
  day: number
  state: ConferenceState
  activeDay: number

  checkedIn: number
  absent: number
  total: number

  days: AttendanceDayTotals[]
  committees: Array<{
    id: string
    code: string
    name: string
    assigned: number
    checkedIn: number
    totalSeats: number
  }>
}

export interface BulkCheckInResult {
  day: number
  updated: number
  unchanged: number

  missing: string[]
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

  conferenceName?: string
  edition?: string
  startsOn?: string
  endsOn?: string
  venue?: string
  contactEmail?: string
}

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

  configured: boolean
}

export interface ResetResult {
  deleted: ResetCounts
  total: number
}

export interface MailResult {
  sent: boolean
  skipped: boolean
  error?: string
}

export type LedgerCategory =
  | 'REGISTRATION'
  | 'SPONSORSHIP'
  | 'VENUE'
  | 'FOOD'
  | 'PRINTING'
  | 'AWARDS'
  | 'TRANSPORT'
  | 'HOSPITALITY'
  | 'MARKETING'
  | 'MISC'

/**
 * One line of the closing statement. Credit and debit are whole rupees and
 * exactly one of them is above zero — the API refuses a line that is both.
 */
export interface LedgerEntry {
  id: string

  entryDate: string
  particular: string
  category: LedgerCategory
  credit: number
  debit: number
  note: string | null
  createdAt: string
  updatedAt: string
  recordedBy: { id: string; fullName: string }
}

export interface LedgerEntryInput {
  entryDate: string
  particular: string
  category: LedgerCategory
  credit: number
  debit: number
  note: string | null
}

export interface LedgerPage extends Paginated<LedgerEntry> {
  /** Across everything the filter matches, not just the page being shown. */
  totals: { credit: number; debit: number }
}

export interface TierIncome {
  tier: PriceTier
  count: number

  total: number

  configuredPrice: number

  expected: number
}

export interface LedgerSummary {
  registrations: {
    tiers: TierIncome[]

    unrecorded: number
    count: number
    collected: number
    expected: number
    shortfall: number
  }
  ledger: {
    byCategory: Array<{ category: LedgerCategory; credit: number; debit: number }>
    credit: number
    debit: number
  }
  net: { income: number; expense: number; balance: number }
}

export type ExclusionReason = 'NO_ALLOCATION' | 'NO_EMAIL' | 'ALREADY_SENT' | 'NO_STUDY_GUIDE'

export interface AnnounceRecipient {
  delegateId: string
  fullName: string
  email: string
  committeeCode: string
  country: string

  previousError: string | null
  attempts: number
}

export interface AnnounceExclusion {
  delegateId: string
  fullName: string
  reason: ExclusionReason

  detail?: string
}

export interface AnnouncePreview {
  willSend: number
  batchSize: number
  batchesNeeded: number

  emailConfigured: boolean

  requireStudyGuide: boolean
  committeesMissingGuide: string[]
  conference: { startsOn: string | null; endsOn: string | null; venue: string | null }
  confirmationPhrase: string
  recipients: AnnounceRecipient[]
  excluded: AnnounceExclusion[]
  excludedCounts: Record<ExclusionReason, number>
}

export interface AnnounceOutcome {
  delegateId: string
  fullName: string
  email: string
  sent: boolean
  error?: string
}

export interface AnnounceBatch {
  sent: number
  failed: number

  remaining: number

  rateLimited: boolean

  done: boolean
  outcomes: AnnounceOutcome[]
  excludedCounts: Record<ExclusionReason, number>

  message?: string
}

export interface PlaceholderCounts {
  registrations: number
  delegates: number
  assignments: number
  logisticsRequests: number
  attendance: number
}

export interface RestartResult {
  deleted: Omit<ResetCounts, 'committees'>
  seeded: PlaceholderCounts
}
