import type { Transporter } from 'nodemailer'
import { env } from '../config/env.js'

export const emailEnabled = env.emailEnabled

export interface MailResult {
  sent: boolean

  skipped: boolean

  error?: string
}

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

let transporter: Transporter | null = null

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter

  const { createTransport } = await import('nodemailer')
  transporter = createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
  })
  return transporter
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!env.emailEnabled) return { sent: false, skipped: true }

  try {
    const transport = await getTransporter()
    await transport.sendMail({
      from: env.SMTP_FROM,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(env.SMTP_REPLY_TO ? { replyTo: env.SMTP_REPLY_TO } : {}),
    })
    return { sent: true, skipped: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    console.warn(`[email] delivery to ${mail.to} failed:`, message)
    return { sent: false, skipped: false, error: message }
  }
}

const BRAND = '#B41884'
const INK = '#1E1018'

function siteUrl(): string {
  const first = env.CORS_ORIGIN.split(',')[0]?.trim().replace(/\/+$/, '')
  return first && !first.includes('localhost') ? first : ''
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface ApprovedRegistration {
  fullName: string
  email: string
  reference: string
  schoolName: string
}

export function registrationApprovedMail(registration: ApprovedRegistration): Mail {
  const { fullName, email, reference, schoolName } = registration
  const site = siteUrl()
  const firstName = fullName.trim().split(/\s+/)[0] ?? fullName

  const subject = `You're confirmed for LRI MUN X — ${reference}`

  const text = [
    `Hello ${firstName},`,
    '',
    `Your registration for LRI Model UN X has been accepted. You are a confirmed delegate.`,
    '',
    `Reference: ${reference}`,
    `Registered as: ${fullName}, ${schoolName}`,
    '',
    `What happens next`,
    `Committee and country allocations are decided once registration closes, and`,
    `they will be sent to this address. There is nothing you need to do until then.`,
    '',
    `Quote your reference if you write to us about your registration.`,
    site ? `\n${site}\n` : '',
    `— The LRI MUN X Secretariat`,
  ].join('\n')

  const html = `<div style="margin:0;padding:24px;background:#FAF7F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};line-height:1.6">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #EADFE6;padding:32px">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${BRAND};font-weight:600">LRI Model UN X</p>
    <h1 style="margin:0 0 24px;font-size:22px;line-height:1.25;color:${INK}">You're confirmed.</h1>

    <p style="margin:0 0 16px">Hello ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 24px">Your registration for LRI Model UN X has been accepted. You are a confirmed delegate.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 24px">
      <tr>
        <td style="padding:12px 16px;background:#FDF2F9;border-left:3px solid ${BRAND}">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4A3D46">Reference</div>
          <div style="font-size:20px;font-weight:700;letter-spacing:.04em;color:${INK}">${escapeHtml(reference)}</div>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4A3D46">Registered as</p>
    <p style="margin:0 0 24px">${escapeHtml(fullName)}<br>${escapeHtml(schoolName)}</p>

    <p style="margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4A3D46">What happens next</p>
    <p style="margin:0 0 24px">Committee and country allocations are decided once registration closes, and they will be sent to this address. There is nothing you need to do until then.</p>

    <p style="margin:0 0 24px;color:#4A3D46;font-size:14px">Quote your reference if you write to us about your registration.</p>

    ${site ? `<p style="margin:0 0 24px"><a href="${escapeHtml(site)}" style="color:${BRAND};font-weight:600;text-decoration:none">${escapeHtml(site.replace(/^https?:\/\//, ''))}</a></p>` : ''}

    <p style="margin:0;padding-top:20px;border-top:1px solid #EADFE6;color:#4A3D46;font-size:14px">— The LRI MUN X Secretariat</p>
  </div>
  <p style="max-width:520px;margin:16px auto 0;color:#96878F;font-size:12px;text-align:center">Sent to ${escapeHtml(email)} because this address was used to register for LRI Model UN X.</p>
</div>`

  return { to: email, subject, text, html }
}

export interface AllocationAnnouncement {
  fullName: string
  email: string
  committeeName: string
  committeeCode: string
  /** The country, or the portfolio where the committee does not seat countries. */
  country: string
  studyGuideUrl: string | null
  /** yyyy-mm-dd from the conference settings, or null while they are unset. */
  startsOn: string | null
  endsOn: string | null
  venue: string | null
}

/**
 * Turns the conference settings into one line a delegate can read.
 *
 * Never invents a date. If the secretariat has not filled the settings in, the
 * line is dropped rather than guessed at — a delegate who is told the wrong
 * weekend is worse off than one who is told nothing and asks.
 */
export function conferenceWhenLine(
  startsOn: string | null,
  endsOn: string | null,
  venue: string | null,
): string | null {
  const dates = formatDateRange(startsOn, endsOn)
  if (!dates && !venue) return null
  if (!dates) return venue
  return venue ? `${dates}, ${venue}` : dates
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function readIsoDate(value: string | null): { year: number; month: number; day: number } | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  return { year, month, day }
}

/** "21-23 November 2026", or "21 November 2026" for a single day. */
export function formatDateRange(startsOn: string | null, endsOn: string | null): string | null {
  const start = readIsoDate(startsOn)
  if (!start) return null

  const end = readIsoDate(endsOn)
  const startMonth = MONTHS[start.month - 1]!

  if (!end || (end.year === start.year && end.month === start.month && end.day === start.day)) {
    return `${start.day} ${startMonth} ${start.year}`
  }

  if (end.year === start.year && end.month === start.month) {
    return `${start.day}-${end.day} ${startMonth} ${start.year}`
  }

  const endMonth = MONTHS[end.month - 1]!
  if (end.year === start.year) {
    return `${start.day} ${startMonth} - ${end.day} ${endMonth} ${start.year}`
  }

  return `${start.day} ${startMonth} ${start.year} - ${end.day} ${endMonth} ${end.year}`
}

export function allocationAnnouncedMail(allocation: AllocationAnnouncement): Mail {
  const { fullName, email, committeeName, committeeCode, country, studyGuideUrl } = allocation
  const site = siteUrl()
  const firstName = fullName.trim().split(/\s+/)[0] ?? fullName
  const when = conferenceWhenLine(allocation.startsOn, allocation.endsOn, allocation.venue)

  const subject = `Your committee for LRI MUN X — ${committeeCode}, ${country}`

  const text = [
    `Hello ${firstName},`,
    '',
    `Your allocation is decided. You are representing ${country} in ${committeeName} (${committeeCode}).`,
    '',
    `Committee: ${committeeName} (${committeeCode})`,
    `Representing: ${country}`,
    ...(when ? [`When: ${when}`] : []),
    '',
    `What to prepare`,
    `Read the study guide first, then research ${country}'s position on the agenda`,
    `it sets out. Come with a position paper and enough on your country's voting`,
    `record to argue from it rather than from general principle.`,
    ...(studyGuideUrl ? ['', `Study guide: ${studyGuideUrl}`] : []),
    '',
    `Reply to this email if the allocation is wrong, or if you cannot attend, so`,
    `the seat goes to someone on the waiting list rather than sitting empty.`,
    site ? `\n${site}\n` : '',
    `— The LRI MUN X Secretariat`,
  ].join('\n')

  const html = `<div style="margin:0;padding:24px;background:#FAF7F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};line-height:1.6">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #EADFE6;padding:32px">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${BRAND};font-weight:600">LRI Model UN X</p>
    <h1 style="margin:0 0 24px;font-size:22px;line-height:1.25;color:${INK}">Your committee is ${escapeHtml(committeeCode)}.</h1>

    <p style="margin:0 0 16px">Hello ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 24px">Your allocation is decided. You are representing ${escapeHtml(country)} in ${escapeHtml(committeeName)}.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 24px">
      <tr>
        <td style="padding:12px 16px;background:#FDF2F9;border-left:3px solid ${BRAND}">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4A3D46">Committee</div>
          <div style="font-size:20px;font-weight:700;letter-spacing:.02em;color:${INK}">${escapeHtml(committeeCode)}</div>
          <div style="color:#4A3D46;font-size:14px">${escapeHtml(committeeName)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#FDF2F9;border-left:3px solid ${BRAND};border-top:1px solid #F3DDEC">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4A3D46">Representing</div>
          <div style="font-size:20px;font-weight:700;letter-spacing:.02em;color:${INK}">${escapeHtml(country)}</div>
        </td>
      </tr>
    </table>

    ${when ? `<p style="margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4A3D46">When</p>
    <p style="margin:0 0 24px">${escapeHtml(when)}</p>` : ''}

    <p style="margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4A3D46">What to prepare</p>
    <p style="margin:0 0 24px">Read the study guide first, then research ${escapeHtml(country)}'s position on the agenda it sets out. Come with a position paper and enough on your country's voting record to argue from it rather than from general principle.</p>

    ${studyGuideUrl ? `<p style="margin:0 0 24px"><a href="${escapeHtml(studyGuideUrl)}" style="display:inline-block;padding:10px 18px;background:${BRAND};color:#FFFFFF;font-weight:600;text-decoration:none">Read the ${escapeHtml(committeeCode)} study guide</a></p>` : ''}

    <p style="margin:0 0 24px;color:#4A3D46;font-size:14px">Reply to this email if the allocation is wrong, or if you cannot attend, so the seat goes to someone on the waiting list rather than sitting empty.</p>

    ${site ? `<p style="margin:0 0 24px"><a href="${escapeHtml(site)}" style="color:${BRAND};font-weight:600;text-decoration:none">${escapeHtml(site.replace(/^https?:\/\//, ''))}</a></p>` : ''}

    <p style="margin:0;padding-top:20px;border-top:1px solid #EADFE6;color:#4A3D46;font-size:14px">— The LRI MUN X Secretariat</p>
  </div>
  <p style="max-width:520px;margin:16px auto 0;color:#96878F;font-size:12px;text-align:center">Sent to ${escapeHtml(email)} because this address was used to register for LRI Model UN X.</p>
</div>`

  return { to: email, subject, text, html }
}

/**
 * Whether an SMTP failure means "you are sending too fast" rather than "this
 * address is wrong".
 *
 * The difference decides what the operator does next: a rate limit is a reason
 * to stop and come back in an hour, and a bad address is a reason to correct
 * one row and carry on. Gmail and Workspace answer 421 or 454 with a message
 * naming the limit, so both the code and the text are checked — providers are
 * inconsistent about which they use.
 */
export function isRateLimitFailure(error: string | undefined): boolean {
  if (!error) return false
  const text = error.toLowerCase()

  if (/\b(421|450|451|454|550 5\.4\.5)\b/.test(text)) return true

  return (
    text.includes('rate limit') ||
    text.includes('too many') ||
    text.includes('quota') ||
    text.includes('throttl') ||
    text.includes('try again later') ||
    text.includes('daily user sending limit')
  )
}
