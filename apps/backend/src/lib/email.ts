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
