/**
 * Tests for fractional indexing.
 */

import { describe, it, expect } from 'vitest'
import {
  generateSortKey,
  generateSortKeyWithJitter,
  isValidSortKey,
  compareSortKeys,
  rebalanceSortKeys,
  needsRebalancing,
  MAX_KEY_LENGTH
} from './fractional-index'

describe('generateSortKey', () => {
  it('returns starting key with no constraints', () => {
    expect(generateSortKey()).toBe('a0')
  })

  it('increments after last key', () => {
    expect(generateSortKey('a0')).toBe('a1')
    expect(generateSortKey('a9')).toBe('aA')
    expect(generateSortKey('aZ')).toBe('aa')
    expect(generateSortKey('az')).toBe('b0')
  })

  it('handles carry over when incrementing', () => {
    // When all chars are max, we append '0' to extend the key
    const result = generateSortKey('zz')
    expect(result > 'zz').toBe(true)
    expect(isValidSortKey(result)).toBe(true)
  })

  it('decrements before first key', () => {
    const key = generateSortKey(undefined, 'a0')
    expect(key < 'a0').toBe(true)
    expect(isValidSortKey(key)).toBe(true)
  })

  it('generates midpoint between keys with room', () => {
    const mid = generateSortKey('a0', 'a4')
    expect(mid).toBe('a2')
    expect(mid > 'a0').toBe(true)
    expect(mid < 'a4').toBe(true)
  })

  it('appends suffix when no room between adjacent keys', () => {
    const mid = generateSortKey('a0', 'a1')
    expect(mid.startsWith('a0')).toBe(true)
    expect(mid > 'a0').toBe(true)
    expect(mid < 'a1').toBe(true)
  })

  it('handles deep insertions', () => {
    const prev = 'a0'
    let next = 'a1'

    // Insert 20 times between same keys (realistic scenario)
    for (let i = 0; i < 20; i++) {
      const mid = generateSortKey(prev, next)
      expect(mid > prev, `mid ${mid} should be > prev ${prev}`).toBe(true)
      expect(mid < next, `mid ${mid} should be < next ${next}`).toBe(true)
      next = mid
    }
  })

  it('throws on invalid order', () => {
    expect(() => generateSortKey('a1', 'a0')).toThrow('Invalid key order')
    expect(() => generateSortKey('a0', 'a0')).toThrow('Invalid key order')
  })

  it('handles keys of different lengths', () => {
    const mid = generateSortKey('a0', 'a0z')
    expect(mid > 'a0').toBe(true)
    expect(mid < 'a0z').toBe(true)
  })
})

describe('generateSortKeyWithJitter', () => {
  it('generates keys with random suffix', () => {
    const key1 = generateSortKeyWithJitter()
    const key2 = generateSortKeyWithJitter()

    // Keys should be different due to jitter
    expect(key1).not.toBe(key2)

    // Both should be valid
    expect(isValidSortKey(key1)).toBe(true)
    expect(isValidSortKey(key2)).toBe(true)
  })

  it('maintains ordering with jitter', () => {
    const key1 = generateSortKeyWithJitter('a0')
    const key2 = generateSortKeyWithJitter('a0')

    // Both should be after 'a0'
    expect(key1 > 'a0').toBe(true)
    expect(key2 > 'a0').toBe(true)
  })
})

describe('isValidSortKey', () => {
  it('accepts valid keys', () => {
    expect(isValidSortKey('a0')).toBe(true)
    expect(isValidSortKey('a0V')).toBe(true)
    expect(isValidSortKey('ZZZ')).toBe(true)
    expect(isValidSortKey('0')).toBe(true)
    expect(isValidSortKey('z')).toBe(true)
    expect(isValidSortKey('a0b1c2')).toBe(true)
  })

  it('rejects invalid keys', () => {
    expect(isValidSortKey('')).toBe(false)
    expect(isValidSortKey('a-0')).toBe(false)
    expect(isValidSortKey('a 0')).toBe(false)
    expect(isValidSortKey('a.0')).toBe(false)
    expect(isValidSortKey('a_0')).toBe(false)
  })
})

describe('compareSortKeys', () => {
  it('compares keys correctly', () => {
    expect(compareSortKeys('a0', 'a1')).toBeLessThan(0)
    expect(compareSortKeys('a1', 'a0')).toBeGreaterThan(0)
    expect(compareSortKeys('a0', 'a0')).toBe(0)
  })

  it('sorts keys correctly', () => {
    const keys = ['a2', 'a0', 'a1', 'a0V']
    const sorted = [...keys].sort(compareSortKeys)

    expect(sorted).toEqual(['a0', 'a0V', 'a1', 'a2'])
  })

  it('maintains order through insertions', () => {
    const keys: string[] = []

    // Build a list through various insertions
    keys.push(generateSortKey()) // a0
    keys.push(generateSortKey(keys[0])) // a1 (after a0)
    keys.push(generateSortKey(keys[0], keys[1])) // between a0 and a1
    keys.push(generateSortKey(undefined, keys[0])) // before a0

    const sorted = [...keys].sort(compareSortKeys)

    // Check that sorted array is in order
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] > sorted[i - 1]).toBe(true)
    }
  })
})

describe('rebalanceSortKeys', () => {
  it('returns empty map for empty input', () => {
    const result = rebalanceSortKeys([])
    expect(result.size).toBe(0)
  })

  it('generates evenly spaced keys', () => {
    const rowIds = ['row1', 'row2', 'row3', 'row4', 'row5']
    const newKeys = rebalanceSortKeys(rowIds)

    expect(newKeys.size).toBe(5)

    // Check they're in order
    const keyValues = Array.from(newKeys.values())
    for (let i = 1; i < keyValues.length; i++) {
      expect(keyValues[i] > keyValues[i - 1]).toBe(true)
    }
  })

  it('produces consistent length keys', () => {
    const rowIds = Array.from({ length: 100 }, (_, i) => `row${i}`)
    const newKeys = rebalanceSortKeys(rowIds)

    const lengths = new Set(Array.from(newKeys.values()).map((k) => k.length))
    expect(lengths.size).toBe(1) // All same length
  })

  it('handles single row', () => {
    const newKeys = rebalanceSortKeys(['row1'])
    expect(newKeys.size).toBe(1)
    expect(isValidSortKey(newKeys.get('row1')!)).toBe(true)
  })

  it('handles large number of rows', () => {
    const rowIds = Array.from({ length: 1000 }, (_, i) => `row${i}`)
    const newKeys = rebalanceSortKeys(rowIds)

    expect(newKeys.size).toBe(1000)

    // Check they're all in order
    const keyValues = Array.from(newKeys.values())
    for (let i = 1; i < keyValues.length; i++) {
      expect(keyValues[i] > keyValues[i - 1]).toBe(true)
    }
  })
})

describe('needsRebalancing', () => {
  it('returns false for short keys', () => {
    expect(needsRebalancing(['a0', 'a1', 'a2'])).toBe(false)
    expect(needsRebalancing(['a0V', 'a0VV', 'a1'])).toBe(false)
  })

  it('returns true for long keys', () => {
    const longKey = 'a'.repeat(MAX_KEY_LENGTH + 1)
    expect(needsRebalancing(['a0', longKey, 'a2'])).toBe(true)
  })

  it('returns false for empty array', () => {
    expect(needsRebalancing([])).toBe(false)
  })
})

describe('MAX_KEY_LENGTH', () => {
  it('is a reasonable value', () => {
    expect(MAX_KEY_LENGTH).toBeGreaterThan(5)
    expect(MAX_KEY_LENGTH).toBeLessThan(20)
  })
})

describe('integration: row ordering simulation', () => {
  it('handles typical usage pattern', () => {
    const rows: { id: string; sortKey: string }[] = []

    // Create initial rows by appending
    let lastKey: string | undefined
    for (let i = 0; i < 5; i++) {
      const sortKey = generateSortKey(lastKey, undefined)
      rows.push({ id: `row${i}`, sortKey })
      lastKey = sortKey
    }

    // Insert in the middle (between row1 and row2)
    const midKey = generateSortKey(rows[1].sortKey, rows[2].sortKey)
    rows.push({ id: 'rowMid', sortKey: midKey })

    // Insert at beginning (before row0)
    const firstKey = generateSortKey(undefined, rows[0].sortKey)
    rows.push({ id: 'rowFirst', sortKey: firstKey })

    // Sort by sortKey
    rows.sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))

    // Verify order: rowFirst, row0, row1, rowMid, row2, row3, row4
    expect(rows[0].id).toBe('rowFirst')
    expect(rows[1].id).toBe('row0')
    expect(rows[2].id).toBe('row1')
    expect(rows[3].id).toBe('rowMid')
    expect(rows[4].id).toBe('row2')
  })

  it('handles many insertions at same position', () => {
    const keys: string[] = []

    // Create 20 rows by appending
    let lastKey: string | undefined
    for (let i = 0; i < 20; i++) {
      const newKey = generateSortKey(lastKey, undefined)
      keys.push(newKey)
      lastKey = newKey
    }

    // Sort and verify all unique and in order
    const sorted = [...keys].sort(compareSortKeys)
    const unique = new Set(sorted)
    expect(unique.size).toBe(sorted.length)

    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] > sorted[i - 1]).toBe(true)
    }
  })
})
