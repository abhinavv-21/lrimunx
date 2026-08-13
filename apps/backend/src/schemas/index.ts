import { z } from 'zod'
import {
  AttendanceStatus,
  RegistrationStatus,
  RequestCategory,
  RequestStatus,
  Role,
} from '@prisma/client'
import { isStorageUrl } from '../lib/storage.js'

export const uuidParam = z.object({ id: z.string().uuid('Expected a UUID') })

// eslint-disable-next-line no-control-regex -- matching control characters is precisely the point here; see the comment above.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

const cleaned = z.string().transform((v) => v.replace(CONTROL_CHARS, '').trim())

const trimmed = (min: number, max: number) => cleaned.pipe(z.string().min(min).max(max))

const trimmedMatching = (min: number, max: number, pattern: RegExp, message: string) =>
  cleaned.pipe(z.string().min(min).max(max).regex(pattern, message))

const phone = z
  .string()
  .trim()
  .min(6, 'Phone number is too short')
  .max(24, 'Phone number is too long')
  .regex(/^[+0-9][0-9\s\-()]*$/, 'Phone number contains unsupported characters')

const countAnswer = (max: number) =>
  z
    .union([
      z.number(),
      z
        .string()
        .trim()
        .regex(/^\d*$/, 'Enter a whole number')
        .transform((v) => (v === '' ? null : Number(v))),
    ])
    .pipe(z.number().int().min(0).max(max).nullable())
    .nullish()

export const EXPERIENCE_MAX = 99

export function isOwnStorageUrl(value: string): boolean {
  return isStorageUrl(value)
}

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().max(120).optional(),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})
export type PaginationQuery = z.infer<typeof paginationQuery>

export const loginSchema = z.object({
  username: trimmed(3, 64),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
})

export const createUserSchema = z.object({
  username: trimmedMatching(3, 64, /^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dot, underscore or hyphen only'),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  fullName: trimmed(2, 120),
  role: z.nativeEnum(Role).default(Role.CONTRIBUTOR),
})

export const updateUserSchema = z
  .object({
    fullName: trimmed(2, 120).optional(),
    role: z.nativeEnum(Role).optional(),
    password: z.string().min(10).max(200).optional(),
    canManageUsers: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')

export const createDelegateSchema = z.object({
  fullName: trimmed(2, 120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(160),
  phone,
  schoolName: trimmed(2, 160),
  grade: trimmed(1, 20),
  committeePreference: z.string().trim().max(160).nullish(),
  committeePreference2: z.string().trim().max(160).nullish(),
  munsAttended: countAnswer(EXPERIENCE_MAX),
  awardsWon: countAnswer(EXPERIENCE_MAX),
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

export const createCommitteeSchema = z.object({
  name: trimmed(2, 160),
  code: trimmed(2, 16).transform((v) => v.toUpperCase()),
  totalSeats: z.coerce.number().int().min(1, 'A committee needs at least one seat').max(500),
})

export const updateCommitteeSchema = createCommitteeSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')

export const AWARD_RANKS: Readonly<Record<string, number>> = {
  'best delegate': 10,
  'outstanding delegate': 20,
  'special mention': 30,
  'best position paper': 40,
}

export const AWARD_RANK_FALLBACK = 90

export function rankForAward(title: string): number {
  return AWARD_RANKS[title.trim().toLowerCase()] ?? AWARD_RANK_FALLBACK
}

export const createAwardSchema = z.object({
  title: trimmed(2, 80),
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

export const checkInSchema = z.object({
  delegateId: z.string().uuid(),
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.CHECKED_IN),
})

export const bulkCheckInSchema = z.object({
  delegateIds: z.array(z.string().uuid()).min(1).max(200),
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.CHECKED_IN),
})

export const auditEntityParams = z.object({
  entityType: z.string().trim().min(1).max(40),
  entityId: z.string().trim().min(1).max(64),
})

export const auditQuery = paginationQuery.extend({
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(64).optional(),
  userId: z.string().uuid().optional(),
  action: z.string().trim().max(40).optional(),
})

export const SETTING_KEYS = ['googleFormUrl', 'googleSheetUrl'] as const
export type SettingKey = (typeof SETTING_KEYS)[number]

const settingUrl = z.union([z.literal(''), z.string().trim().url('Enter a full URL including https://').max(500)])

export const updateSettingsSchema = z
  .object({
    googleFormUrl: settingUrl.optional(),
    googleSheetUrl: settingUrl.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one setting to update')

export const ingestRowSchema = z.object({
  fullName: trimmed(2, 120),
  email: z.string().trim().toLowerCase().email().max(160),
  phone,
  schoolName: trimmed(2, 160),
  grade: trimmed(1, 20),
  committeePreference: z.string().trim().max(160).nullish(),
  dietaryNotes: z.string().trim().max(500).nullish(),
  accessibilityNotes: z.string().trim().max(500).nullish(),
})

export const sheetsWebhookSchema = z.object({
  rows: z.array(ingestRowSchema).min(1).max(500),
  upsert: z.boolean().default(true),
})

export const csvImportSchema = z.object({
  csv: z.string().min(1, 'CSV content is empty').max(2_000_000),
  upsert: z.boolean().default(true),
})

export const matrixImportSchema = z.object({
  csv: z.string().min(1, 'CSV content is empty').max(2_000_000),
  mode: z.enum(['merge', 'replace']).default('merge'),
})

export const matrixCountrySchema = z.object({
  committeeId: z.string().uuid('Expected a committee id'),
  country: trimmed(1, 80),
})

const blankToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish()

const paymentProofUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .refine(
    (v) => v === null || isOwnStorageUrl(v),
    'Upload the payment screenshot through this form rather than pasting a link',
  )
  .nullish()

export const publicRegistrationSchema = z
  .object({
    fullName: trimmed(2, 120),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(160),
    phone,
    schoolName: trimmed(2, 160),
    grade: trimmed(1, 20),
    committeePreference: blankToNull(160),
    committeePreference2: blankToNull(160),
    munsAttended: countAnswer(EXPERIENCE_MAX),
    awardsWon: countAnswer(EXPERIENCE_MAX),
    referralCode: blankToNull(40),
    paymentProofUrl,
    dietaryNotes: blankToNull(500),
    accessibilityNotes: blankToNull(500),
    hp_website: z.literal('').optional(),
  })
  .superRefine((value, ctx) => {
    const { munsAttended, awardsWon } = value
    if (typeof munsAttended !== 'number' || typeof awardsWon !== 'number') return
    if (awardsWon > munsAttended) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['awardsWon'],
        message: `Awards won cannot exceed MUNs attended (${munsAttended})`,
      })
    }
  })
export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>

export const registrationQuery = paginationQuery.extend({
  status: z.nativeEnum(RegistrationStatus).optional(),
})

export const rejectRegistrationSchema = z.object({
  reason: z.string().trim().max(300).nullish(),
})

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

export const exportQuery = z.object({
  dataset: z.enum(['delegates', 'logistics', 'attendance']),
  format: z.enum(['xlsx', 'pdf']),
  committeeId: z.string().uuid().optional(),
})
