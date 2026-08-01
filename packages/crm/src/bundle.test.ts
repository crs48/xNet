import { describe, expect, it } from 'vitest'
import { bundlesFromPrimitives, deriveBundle } from './bundle'

const BUNDLES = new Map<string, string[]>([
  ['partner', ['cohabitate', 'celebrate-anniversaries', 'formalize-commitment']],
  ['coworker', ['make-things', 'prepare-for-time', 'codify-values']],
  ['friend', ['make-things']]
])

describe('deriveBundle (0422)', () => {
  it('reads every bundle at coverage 0 for an empty practice set', () => {
    const readings = deriveBundle([], BUNDLES)
    // An unknown relationship is a valid reading, not an error or an empty list.
    expect(readings).toHaveLength(3)
    expect(readings.every((r) => r.coverage === 0)).toBe(true)
    expect(readings.every((r) => r.matched.length === 0)).toBe(true)
    // Every conventional activity is on offer as something you could try.
    expect(readings.find((r) => r.label === 'partner')?.missing).toEqual([
      'cohabitate',
      'celebrate-anniversaries',
      'formalize-commitment'
    ])
  })

  it('reports a full match with nothing missing', () => {
    const readings = deriveBundle(
      ['cohabitate', 'celebrate-anniversaries', 'formalize-commitment'],
      BUNDLES
    )
    const partner = readings[0]
    expect(partner.label).toBe('partner')
    expect(partner.coverage).toBe(1)
    expect(partner.missing).toEqual([])
  })

  it('orders partial matches by coverage, best first', () => {
    // Practises all of "friend" and one third of "coworker".
    const readings = deriveBundle(['make-things'], BUNDLES)
    expect(readings.map((r) => r.label)).toEqual(['friend', 'coworker', 'partner'])
    expect(readings[0].coverage).toBe(1)
    expect(readings[1].coverage).toBeCloseTo(1 / 3)
    expect(readings[1].missing).toEqual(['prepare-for-time', 'codify-values'])
  })

  it('breaks a coverage tie alphabetically so the order is stable', () => {
    const readings = deriveBundle([], BUNDLES)
    expect(readings.map((r) => r.label)).toEqual(['coworker', 'friend', 'partner'])
  })

  it('ignores a user-authored primitive that belongs to no bundle', () => {
    const withOwnTerm = deriveBundle(['make-things', 'restore-a-motorbike'], BUNDLES)
    // Identical to the reading without it — an unconventional activity is not
    // conventional anywhere, so it cannot match or perturb any bundle.
    expect(withOwnTerm).toEqual(deriveBundle(['make-things'], BUNDLES))
    expect(withOwnTerm.some((r) => r.matched.includes('restore-a-motorbike'))).toBe(false)
  })

  it('scores a vacuous bundle 0 rather than 1', () => {
    const readings = deriveBundle(['make-things'], new Map([['empty', []]]))
    // A bundle expecting nothing must not rank as a perfect match.
    expect(readings[0].coverage).toBe(0)
  })

  it('ignores duplicates on both sides', () => {
    const readings = deriveBundle(
      ['make-things', 'make-things'],
      new Map([['coworker', ['make-things', 'make-things', 'codify-values']]])
    )
    expect(readings[0].coverage).toBe(0.5)
    expect(readings[0].matched).toEqual(['make-things'])
  })
})

describe('bundlesFromPrimitives (0422)', () => {
  it('inverts comma-separated bundle names into a bundle map', () => {
    const map = bundlesFromPrimitives([
      { id: 'cohabitate', conventionalBundles: 'partner, family' },
      { id: 'make-things', conventionalBundles: 'coworker' },
      { id: 'celebrate-anniversaries', conventionalBundles: 'partner, coworker' }
    ])
    expect(map.get('partner')).toEqual(['cohabitate', 'celebrate-anniversaries'])
    expect(map.get('family')).toEqual(['cohabitate'])
    expect(map.get('coworker')).toEqual(['make-things', 'celebrate-anniversaries'])
  })

  it('skips primitives with no conventional bundle', () => {
    // A user-authored term with no bundle is normal, not a parse failure.
    const map = bundlesFromPrimitives([
      { id: 'restore-a-motorbike' },
      { id: 'quiet-sundays', conventionalBundles: '' },
      { id: 'spaces-only', conventionalBundles: '  ,  ' }
    ])
    expect(map.size).toBe(0)
  })
})
