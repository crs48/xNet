import { describe, expect, it } from 'vitest'
import {
  coarsenGeohash,
  decodeGeohash,
  encodeGeohash,
  geohashNeighbors,
  geohashProximity,
  kAnonymityCells,
  sharedPrefixLength
} from './geohash'
import { mutualItems, psiEncode, psiHash, psiIntersect } from './psi'

describe('private set intersection', () => {
  const salt = 'pair-secret'

  it('computes intersection from encoded hashes without revealing non-shared items', () => {
    const mine = ['rust', 'jazz', 'climbing']
    const theirs = ['jazz', 'climbing', 'poetry']
    const theirEncoded = psiEncode(theirs, salt)
    // The encoded set is opaque hashes, not plaintext.
    expect(theirEncoded.every((hash) => /^[0-9a-f]+$/.test(hash))).toBe(true)
    expect(theirEncoded).not.toContain('poetry')

    const overlap = psiIntersect(mine, theirEncoded, salt).sort()
    expect(overlap).toEqual(['climbing', 'jazz'])
  })

  it('is salt-scoped: a different salt yields a different hash', () => {
    expect(psiHash('rust', 'a')).not.toBe(psiHash('rust', 'b'))
    expect(psiHash('rust', 'a')).toBe(psiHash('rust', 'a'))
  })

  it('mutualItems returns the plain intersection for the local-both-sides case', () => {
    expect(mutualItems(['a', 'b', 'c'], ['b', 'c', 'd']).sort()).toEqual(['b', 'c'])
    expect(mutualItems(['a', 'a', 'b'], ['a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('geohash proximity', () => {
  it('round-trips coordinates within the cell error', () => {
    const hash = encodeGeohash(37.7749, -122.4194, 7)
    const decoded = decodeGeohash(hash)
    expect(Math.abs(decoded.lat - 37.7749)).toBeLessThanOrEqual(decoded.latError)
    expect(Math.abs(decoded.lon - -122.4194)).toBeLessThanOrEqual(decoded.lonError)
  })

  it('matches the known geohash for a reference point', () => {
    // San Francisco ~ "9q8yy"
    expect(encodeGeohash(37.7749, -122.4194, 5)).toBe('9q8yy')
  })

  it('coarsens to a larger cell and scores proximity by shared prefix', () => {
    const a = encodeGeohash(37.7749, -122.4194, 7)
    const b = encodeGeohash(37.775, -122.4195, 7) // a few metres away
    expect(coarsenGeohash(a, 5)).toBe(coarsenGeohash(b, 5))
    expect(geohashProximity(a, b)).toBeGreaterThan(0.5)
    expect(sharedPrefixLength('9q8yy', '9q8yz')).toBe(4)
    expect(geohashProximity('9q8yy', 'drt2z')).toBe(0)
  })

  it('produces 8 distinct neighbours and a 9-cell k-anonymity set', () => {
    const cell = encodeGeohash(37.7749, -122.4194, 5)
    const neighbors = geohashNeighbors(cell)
    expect(neighbors).toHaveLength(8)
    expect(new Set(neighbors).size).toBe(8)
    expect(neighbors).not.toContain(cell)
    const kset = kAnonymityCells(cell)
    expect(kset).toHaveLength(9)
    expect(kset[0]).toBe(cell)
  })
})
