import { describe, expect, it } from 'vitest'
import { AnnouncementStatus } from '@prisma/client'
import { BATCH_SIZE, countByReason, partitionRecipients } from './announcements.js'
import { allocationAnnouncedMail, conferenceWhenLine, formatDateRange, isRateLimitFailure } from './email.js'

type Audience = Parameters<typeof partitionRecipients>[0]

function delegate(overrides: Partial<Audience[number]> = {}): Audience[number] {
  return {
    id: 'd1',
    fullName: 'Aarav Shrestha',
    email: 'aarav@example.org',
    assignment: {
      country: 'France',
      committee: {
        id: 'c1',
        code: 'UNSC',
        name: 'United Nations Security Council',
        studyGuideUrl: 'https://lrimunx.org/guides/unsc.pdf',
      },
    },
    announcement: null,
    ...overrides,
  } as Audience[number]
}

describe('partitionRecipients', () => {
  it('includes a delegate who is allocated, reachable and not yet told', () => {
    const { recipients, excluded } = partitionRecipients([delegate()], true)

    expect(excluded).toEqual([])
    expect(recipients).toHaveLength(1)
    expect(recipients[0]).toMatchObject({
      committeeCode: 'UNSC',
      country: 'France',
      email: 'aarav@example.org',
    })
  })

  it('excludes a delegate with no allocation, and says so', () => {
    const { recipients, excluded } = partitionRecipients([delegate({ assignment: null })], true)

    expect(recipients).toEqual([])
    expect(excluded[0]).toMatchObject({ reason: 'NO_ALLOCATION', fullName: 'Aarav Shrestha' })
  })

  it('excludes a delegate with no email rather than failing on them later', () => {
    const { excluded } = partitionRecipients([delegate({ email: '   ' })], true)
    expect(excluded[0]?.reason).toBe('NO_EMAIL')
  })

  it('never mails anyone twice — a SENT row excludes them permanently', () => {
    const alreadyTold = delegate({
      announcement: { status: AnnouncementStatus.SENT, error: null, attempts: 1 },
    })

    const { recipients, excluded } = partitionRecipients([alreadyTold], true)
    expect(recipients).toEqual([])
    expect(excluded[0]?.reason).toBe('ALREADY_SENT')
  })

  it('picks a previous failure back up, and carries the reason it failed', () => {
    const failed = delegate({
      announcement: {
        status: AnnouncementStatus.FAILED,
        error: '550 mailbox unavailable',
        attempts: 2,
      },
    })

    const { recipients } = partitionRecipients([failed], true)
    expect(recipients).toHaveLength(1)
    expect(recipients[0]).toMatchObject({ previousError: '550 mailbox unavailable', attempts: 2 })
  })

  it('holds back a committee with no study guide, and names the committee', () => {
    const noGuide = delegate({
      assignment: {
        country: 'Brazil',
        committee: { id: 'c2', code: 'ECOFIN', name: 'Economic and Financial', studyGuideUrl: null },
      },
    } as Partial<Audience[number]>)

    const { recipients, excluded } = partitionRecipients([noGuide], true)
    expect(recipients).toEqual([])
    expect(excluded[0]).toMatchObject({ reason: 'NO_STUDY_GUIDE', detail: 'ECOFIN' })
  })

  it('sends without a guide when the caller has deliberately opted out', () => {
    const noGuide = delegate({
      assignment: {
        country: 'Brazil',
        committee: { id: 'c2', code: 'ECOFIN', name: 'Economic and Financial', studyGuideUrl: null },
      },
    } as Partial<Audience[number]>)

    const { recipients, excluded } = partitionRecipients([noGuide], false)
    expect(excluded).toEqual([])
    expect(recipients[0]?.studyGuideUrl).toBeNull()
  })

  it('counts every exclusion reason, including the ones at zero', () => {
    const counts = countByReason([
      { delegateId: 'a', fullName: 'A', reason: 'NO_ALLOCATION' },
      { delegateId: 'b', fullName: 'B', reason: 'NO_ALLOCATION' },
      { delegateId: 'c', fullName: 'C', reason: 'ALREADY_SENT' },
    ])

    expect(counts).toEqual({
      NO_ALLOCATION: 2,
      NO_EMAIL: 0,
      ALREADY_SENT: 1,
      NO_STUDY_GUIDE: 0,
    })
  })

  it('batches at a size that fits inside a thirty-second request', () => {
    expect(BATCH_SIZE).toBeGreaterThan(0)
    expect(BATCH_SIZE).toBeLessThanOrEqual(50)
  })
})

describe('isRateLimitFailure', () => {
  it('recognises the codes and phrases providers throttle with', () => {
    for (const error of [
      '421 4.7.0 Try again later, closing connection',
      '454 4.7.1 Too many messages',
      'Daily user sending limit exceeded',
      'Message rate limit exceeded for this account',
      'Your request has been throttled',
      '450 Requested action aborted',
    ]) {
      expect(isRateLimitFailure(error)).toBe(true)
    }
  })

  it('does not mistake a bad address for a rate limit', () => {
    for (const error of [
      '550 5.1.1 The email account that you tried to reach does not exist',
      'Invalid recipient',
      'Connection timed out',
      undefined,
      '',
    ]) {
      expect(isRateLimitFailure(error)).toBe(false)
    }
  })
})

describe('formatDateRange', () => {
  it('writes the conference dates the way a person says them', () => {
    expect(formatDateRange('2026-11-21', '2026-11-23')).toBe('21-23 November 2026')
  })

  it('collapses a single day rather than repeating it', () => {
    expect(formatDateRange('2026-11-21', '2026-11-21')).toBe('21 November 2026')
    expect(formatDateRange('2026-11-21', null)).toBe('21 November 2026')
  })

  it('spans a month and a year boundary', () => {
    expect(formatDateRange('2026-11-30', '2026-12-02')).toBe('30 November - 2 December 2026')
    expect(formatDateRange('2026-12-31', '2027-01-02')).toBe('31 December 2026 - 2 January 2027')
  })

  it('invents nothing when the settings have not been filled in', () => {
    expect(formatDateRange(null, '2026-11-23')).toBeNull()
    expect(formatDateRange('', '')).toBeNull()
    expect(formatDateRange('November 2026', null)).toBeNull()
  })

  it('drops the whole line rather than mailing half of it', () => {
    expect(conferenceWhenLine(null, null, null)).toBeNull()
    expect(conferenceWhenLine(null, null, 'LRI School, Kalanki')).toBe('LRI School, Kalanki')
    expect(conferenceWhenLine('2026-11-21', '2026-11-23', 'LRI School, Kalanki')).toBe(
      '21-23 November 2026, LRI School, Kalanki',
    )
  })
})

describe('allocationAnnouncedMail', () => {
  const base = {
    fullName: 'Prakriti Basnet',
    email: 'prakriti@example.org',
    committeeName: 'United Nations Security Council',
    committeeCode: 'UNSC',
    country: 'France',
    studyGuideUrl: 'https://lrimunx.org/guides/unsc.pdf',
    startsOn: '2026-11-21',
    endsOn: '2026-11-23',
    venue: 'LRI School, Kalanki',
  }

  it('names the committee and the country in the subject, where it is readable', () => {
    expect(allocationAnnouncedMail(base).subject).toBe('Your committee for LRI MUN X — UNSC, France')
  })

  it('states the committee, the country and the dates in the body', () => {
    const mail = allocationAnnouncedMail(base)
    for (const fragment of ['France', 'United Nations Security Council', '21-23 November 2026', 'LRI School, Kalanki']) {
      expect(mail.text).toContain(fragment)
      expect(mail.html).toContain(fragment)
    }
  })

  it('links the study guide when there is one and says nothing when there is not', () => {
    expect(allocationAnnouncedMail(base).text).toContain('https://lrimunx.org/guides/unsc.pdf')

    const without = allocationAnnouncedMail({ ...base, studyGuideUrl: null })
    expect(without.text).not.toContain('Study guide:')
    expect(without.html).not.toContain('study guide</a>')
  })

  it('leaves the date line out entirely when the settings are empty', () => {
    const undated = allocationAnnouncedMail({ ...base, startsOn: null, endsOn: null, venue: null })
    expect(undated.text).not.toContain('When:')
    expect(undated.text).not.toContain('null')
    expect(undated.html).not.toContain('null')
  })

  it('escapes a name that would otherwise break the HTML', () => {
    const mail = allocationAnnouncedMail({ ...base, country: 'Côte d\'Ivoire <script>' })
    expect(mail.html).toContain('&lt;script&gt;')
    expect(mail.html).not.toContain('<script>')
  })

  it('writes to the delegate, not to whoever pressed the button', () => {
    expect(allocationAnnouncedMail(base).to).toBe('prakriti@example.org')
  })
})
