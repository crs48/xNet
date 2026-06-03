import { describe, expect, it } from 'vitest'
import {
  assessDuplicateContent,
  canonicalizeContentText,
  compareContentFingerprints,
  createContentFingerprint
} from '../src/content-fingerprint'

describe('content fingerprints', () => {
  it('canonicalizes casing, punctuation, URLs, and whitespace', () => {
    expect(canonicalizeContentText('  Hello, HELLO! https://example.com/a  ')).toBe(
      'hello hello url'
    )
  })

  it('detects exact duplicates by normalized content hash', () => {
    const first = createContentFingerprint('Research note: a local-first network resists spam.')
    const second = createContentFingerprint('research NOTE a local first network resists spam')
    const assessment = compareContentFingerprints(second, first)

    expect(assessment).toMatchObject({
      duplicateScore: 1,
      matchType: 'exact',
      exact: true,
      reasons: ['exact-content-hash']
    })
  })

  it('detects near duplicates with deterministic shingles', () => {
    const options = { shingleSize: 3 }
    const first = createContentFingerprint(
      'Local-first networks should rate limit public writes, verify signatures, and quarantine first-contact messages.',
      options
    )
    const second = createContentFingerprint(
      'Local-first networks should rate limit public writes, verify signatures, and quarantine first-contact messages. Operators can review appeals.',
      options
    )
    const assessment = compareContentFingerprints(second, first, options)

    expect(assessment.matchType).toBe('near')
    expect(assessment.duplicateScore).toBeGreaterThanOrEqual(0.75)
    expect(assessment.reasons).toContain('near-duplicate-shingles')
  })

  it('selects the closest match across references', () => {
    const assessment = assessDuplicateContent(
      'Crawled pages should include source provenance and citation coverage signals.',
      [
        'Unrelated operational notes about storage adapters.',
        'Crawled pages should include source provenance and citation coverage signals.'
      ],
      { shingleSize: 3 }
    )

    expect(assessment.matchType).toBe('exact')
    expect(assessment.matchedIndex).toBe(1)
    expect(assessment.duplicateScore).toBe(1)
  })

  it('does not overmatch unrelated content', () => {
    const first = createContentFingerprint('Passkey identity unlocks encrypted local workspaces.')
    const second = createContentFingerprint('Crawl budgets protect public search hubs from spam.')
    const assessment = compareContentFingerprints(second, first)

    expect(assessment.matchType).toBe('none')
    expect(assessment.duplicateScore).toBeLessThan(0.55)
  })
})
