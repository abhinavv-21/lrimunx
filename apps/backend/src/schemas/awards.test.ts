import { describe, expect, it } from 'vitest'
import { AWARD_RANK_FALLBACK, createAwardSchema, rankForAward, updateAwardSchema } from './index.js'

describe('rankForAward', () => {
  it('orders the standard ceremony correctly', () => {
    const ceremony = ['Best Position Paper', 'Special Mention', 'Best Delegate', 'Outstanding Delegate']
    const ordered = [...ceremony].sort((a, b) => rankForAward(a) - rankForAward(b))

    expect(ordered).toEqual([
      'Best Delegate',
      'Outstanding Delegate',
      'Special Mention',
      'Best Position Paper',
    ])
  })

  it('ignores casing and surrounding whitespace', () => {
    expect(rankForAward('  bEsT dElEgAtE  ')).toBe(rankForAward('Best Delegate'))
  })

  it('sorts a conference-specific award after every standard one', () => {
    const custom = rankForAward('Spirit of LRI MUN')
    expect(custom).toBe(AWARD_RANK_FALLBACK)
    expect(custom).toBeGreaterThan(rankForAward('Best Position Paper'))
  })
})

describe('createAwardSchema', () => {
  it('accepts an award with no recipient — a slot decided before its winner', () => {
    const parsed = createAwardSchema.parse({ title: 'Best Delegate', delegateId: null })
    expect(parsed.delegateId).toBeNull()
  })

  it('trims the title', () => {
    expect(createAwardSchema.parse({ title: '  Special Mention  ' }).title).toBe('Special Mention')
  })

  it('rejects a blank title', () => {
    expect(createAwardSchema.safeParse({ title: '   ' }).success).toBe(false)
  })

  it('rejects a recipient that is not a UUID', () => {
    expect(createAwardSchema.safeParse({ title: 'Best Delegate', delegateId: 'aarav' }).success).toBe(false)
  })
})

describe('updateAwardSchema', () => {
  it('rejects an empty patch rather than issuing a no-op write', () => {
    expect(updateAwardSchema.safeParse({}).success).toBe(false)
  })

  it('allows clearing the recipient on its own', () => {
    const result = updateAwardSchema.safeParse({ delegateId: null })
    expect(result.success).toBe(true)
  })
})
