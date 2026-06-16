import { describe, expect, it } from 'vitest'
import {
  blockingKey,
  emailDomain,
  findDuplicateCandidates,
  jaroWinkler,
  matchScore,
  nameSimilarity,
  normalizeEmail,
  normalizePhone
} from './dedup'

describe('normalizers', () => {
  it('normalizes emails and extracts the domain', () => {
    expect(normalizeEmail('  John@Example.COM ')).toBe('john@example.com')
    expect(normalizeEmail('')).toBeNull()
    expect(emailDomain('a@Company.com')).toBe('company.com')
    expect(emailDomain('nope')).toBeNull()
  })

  it('normalizes phones to digits, keeping a leading +', () => {
    expect(normalizePhone('+1 (415) 555-1234')).toBe('+14155551234')
    expect(normalizePhone('415.555.1234')).toBe('4155551234')
    expect(normalizePhone('')).toBeNull()
  })
})

describe('jaroWinkler', () => {
  it('is 1 for identical and boosts shared prefixes', () => {
    expect(jaroWinkler('martha', 'martha')).toBe(1)
    expect(jaroWinkler('martha', 'marhta')).toBeGreaterThan(0.9)
    expect(nameSimilarity('Jon Smith', 'John Smith')).toBeGreaterThan(0.9)
    expect(nameSimilarity('', 'x')).toBe(0)
  })
})

describe('blockingKey', () => {
  it('blocks by email domain, falling back to a name key', () => {
    expect(blockingKey({ id: '1', email: 'a@acme.com' })).toBe('d:acme.com')
    expect(blockingKey({ id: '2', displayName: 'Jane Doe' })).toBe('n:doe')
  })
})

describe('matchScore', () => {
  it('treats an exact email as a certain match', () => {
    const r = matchScore(
      { id: '1', displayName: 'J', email: 'a@b.com' },
      { id: '2', displayName: 'Different', email: 'A@B.com' }
    )
    expect(r.score).toBe(1)
    expect(r.reasons).toContain('same email')
  })

  it('treats the same phone (differently formatted) as nearly certain', () => {
    const r = matchScore(
      { id: '1', displayName: 'J', phone: '+1 (415) 555-1234' },
      { id: '2', displayName: 'K', phone: '+1 415.555.1234' }
    )
    expect(r.score).toBeGreaterThanOrEqual(0.95)
    expect(r.reasons).toContain('same phone')
  })

  it('falls back to name similarity nudged by a shared domain', () => {
    const r = matchScore(
      { id: '1', displayName: 'Jon Smith', email: 'jon@acme.com' },
      { id: '2', displayName: 'John Smith', email: 'johns@acme.com' }
    )
    expect(r.score).toBeGreaterThan(0.85)
    expect(r.reasons).toContain('same domain')
  })
})

describe('findDuplicateCandidates', () => {
  it('finds dupes across name/email/phone and sorts by confidence', () => {
    const candidates = findDuplicateCandidates([
      { id: 'a', displayName: 'John Smith', email: 'john@acme.com' },
      { id: 'b', displayName: 'J. Smith', email: 'john@acme.com' }, // same email → 1.0
      { id: 'c', displayName: 'Jon Smith', email: 'jon@acme.com' }, // name+domain
      { id: 'd', displayName: 'Totally Different', email: 'x@other.com' }
    ])
    expect(candidates.length).toBeGreaterThanOrEqual(1)
    expect(candidates[0]).toMatchObject({ a: 'a', b: 'b', score: 1 })
    // The unrelated contact never pairs up.
    expect(candidates.some((c) => c.a === 'd' || c.b === 'd')).toBe(false)
  })
})
