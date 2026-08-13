import { describe, expect, it } from 'vitest'
import { registrationApprovedMail, sendMail } from './email.js'
import { env } from '../config/env.js'

const SAMPLE = {
  fullName: 'Aayush Shrestha',
  email: 'aayush.shrestha@example.org',
  reference: 'LMX-7K2Q9D',
  schoolName: "Learning Realm Int'l School",
}

describe('the approval confirmation', () => {
  it('puts the reference in the subject, because that is what a reply will quote', () => {
    const mail = registrationApprovedMail(SAMPLE)
    expect(mail.subject).toContain('LMX-7K2Q9D')
    expect(mail.to).toBe(SAMPLE.email)
  })

  it('always carries a plain-text part alongside the HTML', () => {
    const mail = registrationApprovedMail(SAMPLE)

    expect(mail.text.length).toBeGreaterThan(80)
    expect(mail.html).toContain('<div')
    expect(mail.text).not.toContain('<div')
  })

  it('greets by first name and states the school it accepted', () => {
    const mail = registrationApprovedMail(SAMPLE)
    expect(mail.text).toContain('Hello Aayush,')
    expect(mail.text).toContain("Learning Realm Int'l School")
    expect(mail.html).toContain('Hello Aayush,')
  })

  it('survives a single-word name rather than producing "Hello undefined"', () => {
    const mail = registrationApprovedMail({ ...SAMPLE, fullName: 'Prakriti' })
    expect(mail.text).toContain('Hello Prakriti,')
    expect(mail.text).not.toContain('undefined')
  })

  it('escapes the applicant name into the HTML part', () => {
    const mail = registrationApprovedMail({
      ...SAMPLE,
      fullName: 'Ann <script>alert(1)</script> Rai',
      schoolName: 'St. Mary & Co',
    })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
    expect(mail.html).toContain('St. Mary &amp; Co')
  })

  it('quotes no fee, date or venue', () => {
    const body = registrationApprovedMail(SAMPLE).text.toLowerCase()
    for (const word of ['npr', 'rs.', 'fee', 'deadline', 'venue']) {
      expect(body).not.toContain(word)
    }
  })

  it('tells the recipient why they received it', () => {
    const mail = registrationApprovedMail(SAMPLE)
    expect(mail.html).toContain(SAMPLE.email)
  })
})

describe('sending when SMTP is not configured', () => {
  it('reports skipped rather than failed, and never throws', async () => {
    if (env.emailEnabled) {
      expect(env.SMTP_HOST).not.toBe('')
      return
    }

    const result = await sendMail(registrationApprovedMail(SAMPLE))
    expect(result).toEqual({ sent: false, skipped: true })
    expect(result.error).toBeUndefined()
  })
})
