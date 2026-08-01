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

/**
 * C0/C1 control characters, minus the whitespace `.trim()` already handles.
 *
 * Postgres rejects U+0000 in a `text` column outright (SQLSTATE 22021), so a
 * name pasted from a mangled export used to surface as a 500 — the applicant
 * was told the server had broken and their registration silently did not
 * happen. The rest are stripped rather than rejected because they are almost
 * always invisible passengers from a copy-paste, not something a person typed
 * and would want to be told about.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

const cleaned = z.string().transform((v) => v.replace(CONTROL_CHARS, '').trim())

const trimmed = (min: number, max: number) => cleaned.pipe(z.string().min(min).max(max))

/** As `trimmed`, for the fields that also constrain their shape. */
const trimmedMatching = (min: number, max: number, pattern: RegExp, message: string) =>
  cleaned.pipe(z.string().min(min).max(max).regex(pattern, message))

/** Permissive enough for international numbers, strict enough to reject junk. */
const phone = z
  .string()
  .trim()
  .min(6, 'Phone number is too short')
  .max(24, 'Phone number is too long')
  .regex(/^[+0-9][0-9\s\-()]*$/, 'Phone number contains unsupported characters')

/**
 * A small count answered on a form — MUNs attended, awards won.
 *
 * A browser number input sends "" when untouched and a string of digits
 * otherwise, so the coercion belongs here rather than at the column. Written as
 * an explicit union instead of `z.coerce.number()` because coerce runs
 * `Number()` over anything: `true` becomes 1 and `[]` becomes 0, which on an
 * unauthenticated endpoint means a bot's junk lands in the table as a plausible
 * looking figure.
 */
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

/** Nobody attends more than this many conferences before leaving school. */
export const EXPERIENCE_MAX = 99

/**
 * The host Vercel Blob serves uploads from: `<store>.public.blob.vercel-storage.com`.
 *
 * The leading dot is load-bearing. Without it `evil-public.blob.vercel-storage.com`
 * — or worse, a bare `public.blob.vercel-storage.com` — would satisfy the check.
 */
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com'

/**
 * Is this a URL on our blob store, rather than any URL at all?
 *
 * The field it guards is rendered in the review queue as a link an admin
 * clicks, so accepting arbitrary URLs would turn a public, unauthenticated form
 * into a way to put an attacker-chosen destination in front of the one account
 * that can approve registrations and create users. Parsing with `URL` rather
 * than matching the string is what stops
 * `https://evil.example/x.png#.public.blob.vercel-storage.com` from passing.
 */
export function isBlobStorageUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return url.protocol === 'https:' && url.hostname.endsWith(BLOB_HOST_SUFFIX)
}

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
  committeePreference2: z.string().trim().max(160).nullish(),
  /**
   * Carried over from the registration rather than edited here, but accepted so
   * that a delegate edit round-trips them instead of silently dropping what the
   * applicant told us. The awards-vs-MUNs rule is enforced on the public form,
   * where both numbers always arrive together; a PATCH may carry one of them.
   */
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
/**
 * An untouched optional field arrives from a browser form as "", never as
 * absent — that is how HTML form serialisation works. Storing it verbatim
 * would fill the column with empty strings that every reader then has to treat
 * as "no answer" alongside null. Blank means blank; the CSV importer already
 * makes the same conversion in `normaliseRow`.
 */
const blankToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish()

/**
 * The payment screenshot, as a URL on our own blob store.
 *
 * The browser uploads the file straight to Vercel Blob and posts back only the
 * resulting URL, so this string is the entire trace of the upload. It is
 * checked against the blob host rather than merely parsed as a URL — see
 * isBlobStorageUrl for why an open field here is an attack on the reviewer, not
 * on the applicant.
 */
const paymentProofUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .refine(
    (v) => v === null || isBlobStorageUrl(v),
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
  .superRefine((value, ctx) => {
    // You cannot win an award at a conference you did not attend. Reported
    // against awardsWon because that is the number the applicant should lower —
    // the alternative reading, "they under-counted their MUNs", is not ours to
    // guess at. Only checked when both are answered; either alone is legitimate.
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
