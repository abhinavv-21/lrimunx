import { z } from 'zod'
import {
  AttendanceStatus,
  RegistrationStatus,
  RequestCategory,
  RequestStatus,
  Role,
} from '@prisma/client'

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

export const uuidParam = z.object({ id: z.string().uuid('Expected a UUID') })

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max)

/** Permissive enough for international numbers, strict enough to reject junk. */
const phone = z
  .string()
  .trim()
  .min(6, 'Phone number is too short')
  .max(24, 'Phone number is too long')
  .regex(/^[+0-9][0-9\s\-()]*$/, 'Phone number contains unsupported characters')

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().max(120).optional(),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})
export type PaginationQuery = z.infer<typeof paginationQuery>

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export const loginSchema = z.object({
  username: trimmed(3, 64),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
})

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

export const createUserSchema = z.object({
  username: trimmed(3, 64).regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dot, underscore or hyphen only'),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  fullName: trimmed(2, 120),
  role: z.nativeEnum(Role).default(Role.CONTRIBUTOR),
})

export const updateUserSchema = z
  .object({
    fullName: trimmed(2, 120).optional(),
    role: z.nativeEnum(Role).optional(),
    password: z.string().min(10).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')

/* -------------------------------------------------------------------------- */
/* Delegates                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Committee and country live on the Assignment record, but they are edited
 * directly on the delegate — there is no separate assignments screen. Passing
 * committeeId + country creates or moves the assignment; passing committeeId
 * as null clears it.
 */
export const createDelegateSchema = z.object({
  fullName: trimmed(2, 120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(160),
  phone,
  schoolName: trimmed(2, 160),
  grade: trimmed(1, 20),
  /** What they asked for on the form. Never a placement — see the schema note. */
  committeePreference: z.string().trim().max(160).nullish(),
  dietaryNotes: z.string().trim().max(500).nullish(),
  accessibilityNotes: z.string().trim().max(500).nullish(),
  attendanceStatus: z.nativeEnum(AttendanceStatus).optional(),
  committeeId: z.string().uuid().nullish(),
  country: z.string().trim().max(80).nullish(),
})

export const updateDelegateSchema = createDelegateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')

export const delegateQuery = paginationQuery.extend({
  attendanceStatus: z.nativeEnum(AttendanceStatus).optional(),
  committeeId: z.string().uuid().optional(),
  unassigned: z.coerce.boolean().optional(),
})

/* -------------------------------------------------------------------------- */
/* Committees                                                                  */
/* -------------------------------------------------------------------------- */

export const createCommitteeSchema = z.object({
  name: trimmed(2, 160),
  code: trimmed(2, 16).transform((v) => v.toUpperCase()),
  totalSeats: z.coerce.number().int().min(1, 'A committee needs at least one seat').max(500),
})

export const updateCommitteeSchema = createCommitteeSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')

/* -------------------------------------------------------------------------- */
/* Awards                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Ceremony order for the titles a MUN actually announces, lowest rank first.
 * Titles are free text so a conference can invent its own — anything not
 * listed here sorts after everything that is, rather than being rejected.
 */
export const AWARD_RANKS: Readonly<Record<string, number>> = {
  'best delegate': 10,
  'outstanding delegate': 20,
  'special mention': 30,
  'best position paper': 40,
}

/** Unlisted titles land here — after every standard award. */
export const AWARD_RANK_FALLBACK = 90

export function rankForAward(title: string): number {
  return AWARD_RANKS[title.trim().toLowerCase()] ?? AWARD_RANK_FALLBACK
}

export const createAwardSchema = z.object({
  title: trimmed(2, 80),
  /** Null is a real state: the award exists as a slot before a winner is chosen. */
  delegateId: z.string().uuid().nullish(),
  note: z.string().trim().max(300).nullish(),
})

export const updateAwardSchema = createAwardSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')

export const awardParams = z.object({
  id: z.string().uuid('Expected a UUID'),
  awardId: z.string().uuid('Expected a UUID'),
})

/* -------------------------------------------------------------------------- */
/* Assignments                                                                 */
/* -------------------------------------------------------------------------- */

export const createAssignmentSchema = z.object({
  delegateId: z.string().uuid(),
  committeeId: z.string().uuid(),
  country: trimmed(2, 80),
})

export const updateAssignmentSchema = z
  .object({
    committeeId: z.string().uuid().optional(),
    country: trimmed(2, 80).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')

/* -------------------------------------------------------------------------- */
/* Logistics requests                                                          */
/* -------------------------------------------------------------------------- */

export const createLogisticsSchema = z.object({
  title: trimmed(3, 160),
  category: z.nativeEnum(RequestCategory),
  description: trimmed(3, 2000),
  committeeId: z.string().uuid().nullish(),
})

export const updateLogisticsSchema = z
  .object({
    title: trimmed(3, 160).optional(),
    category: z.nativeEnum(RequestCategory).optional(),
    description: trimmed(3, 2000).optional(),
    committeeId: z.string().uuid().nullish(),
    status: z.nativeEnum(RequestStatus).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')

export const logisticsQuery = paginationQuery.extend({
  status: z.nativeEnum(RequestStatus).optional(),
  category: z.nativeEnum(RequestCategory).optional(),
  committeeId: z.string().uuid().optional(),
  mine: z.coerce.boolean().optional(),
})

/* -------------------------------------------------------------------------- */
/* Attendance                                                                  */
/* -------------------------------------------------------------------------- */

export const checkInSchema = z.object({
  delegateId: z.string().uuid(),
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.CHECKED_IN),
})

export const bulkCheckInSchema = z.object({
  delegateIds: z.array(z.string().uuid()).min(1).max(200),
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.CHECKED_IN),
})

/* -------------------------------------------------------------------------- */
/* Audit                                                                       */
/* -------------------------------------------------------------------------- */

export const auditQuery = paginationQuery.extend({
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(64).optional(),
  userId: z.string().uuid().optional(),
  action: z.string().trim().max(40).optional(),
})

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

/** Keys the app knows about. Anything else is rejected rather than stored. */
export const SETTING_KEYS = ['googleFormUrl', 'googleSheetUrl'] as const
export type SettingKey = (typeof SETTING_KEYS)[number]

// An empty string clears the setting; anything else must be a real URL.
const settingUrl = z.union([z.literal(''), z.string().trim().url('Enter a full URL including https://').max(500)])

export const updateSettingsSchema = z
  .object({
    googleFormUrl: settingUrl.optional(),
    googleSheetUrl: settingUrl.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one setting to update')

/* -------------------------------------------------------------------------- */
/* Integrations                                                                */
/* -------------------------------------------------------------------------- */

/** One inbound row from Google Forms/Sheets or a pasted CSV. */
export const ingestRowSchema = z.object({
  fullName: trimmed(2, 120),
  email: z.string().trim().toLowerCase().email().max(160),
  phone,
  schoolName: trimmed(2, 160),
  grade: trimmed(1, 20),
  /**
   * Imported, unlike committee and country. A preference is something the
   * delegate stated on the form; a placement is a decision the secretariat
   * makes in Allocations, so only the former can arrive from a spreadsheet.
   */
  committeePreference: z.string().trim().max(160).nullish(),
  dietaryNotes: z.string().trim().max(500).nullish(),
  accessibilityNotes: z.string().trim().max(500).nullish(),
})

export const sheetsWebhookSchema = z.object({
  rows: z.array(ingestRowSchema).min(1).max(500),
  /** When true, existing delegates matched by email are updated instead of skipped. */
  upsert: z.boolean().default(true),
})

export const csvImportSchema = z.object({
  csv: z.string().min(1, 'CSV content is empty').max(2_000_000),
  upsert: z.boolean().default(true),
})

/* -------------------------------------------------------------------------- */
/* Public registrations                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The body the public conference website posts to /public/register.
 *
 * The field list mirrors ingestRowSchema rather than createDelegateSchema on
 * purpose: an applicant supplies the same facts a Google Form row carries, and
 * nothing that represents a decision the secretariat makes. There is no role,
 * no attendance status and no committee placement here, and there is no path
 * from this payload to a User — see the Registration model note.
 */
export const publicRegistrationSchema = z.object({
  fullName: trimmed(2, 120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(160),
  phone,
  schoolName: trimmed(2, 160),
  grade: trimmed(1, 20),
  committeePreference: z.string().trim().max(160).nullish(),
  dietaryNotes: z.string().trim().max(500).nullish(),
  accessibilityNotes: z.string().trim().max(500).nullish(),
  /**
   * Honeypot. Hidden from humans on the website, so a real applicant always
   * leaves it empty — declared as "must be blank" rather than "must be absent"
   * because a browser submits an empty hidden input.
   *
   * A filled one never reaches this schema: honeypotGate runs ahead of
   * validation and answers with the same 201 a real submission gets, so a bot
   * is never told which field caught it.
   */
  hp_website: z.literal('').optional(),
})
export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>

export const registrationQuery = paginationQuery.extend({
  status: z.nativeEnum(RegistrationStatus).optional(),
})

export const rejectRegistrationSchema = z.object({
  reason: z.string().trim().max(300).nullish(),
})

/* -------------------------------------------------------------------------- */
/* Push                                                                        */
/* -------------------------------------------------------------------------- */

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(600),
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(4).max(200),
  }),
})

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(600),
})

/* -------------------------------------------------------------------------- */
/* Exports                                                                     */
/* -------------------------------------------------------------------------- */

export const exportQuery = z.object({
  dataset: z.enum(['delegates', 'logistics', 'attendance']),
  format: z.enum(['xlsx', 'pdf']),
  committeeId: z.string().uuid().optional(),
})
