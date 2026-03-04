/**
 * @xnetjs/data - Computed cache tests.
 */

import type { ComputedCacheEntry } from './computed-cache'
import { describe, it, expect } from 'vitest'
import {
  ComputedCache,
  createComputedCache,
  batchInvalidate,
  computeInputHash,
  isEntryValid,
  DEFAULT_COMPUTED_CACHE_CONFIG
} from './computed-cache'

// ─── Test Helpers ────────────────────────────────────────────────────────────

const createEntry = (
  value: unknown,
  dependencies: string[] = [],
  computedAt = Date.now()
): ComputedCacheEntry => ({
  value,
  computedAt,
  inputHash: computeInputHash({ value }),
  dependencies
})

// ─── ComputedCache Tests ─────────────────────────────────────────────────────

describe('ComputedCache', () => {
  describe('get/set', () => {
    it('stores and retrieves values', () => {
      const cache = new ComputedCache()
      const entry = createEntry(42)

      cache.set('row-1', 'total', entry)
      const result = cache.get('row-1', 'total')

      expect(result).toEqual(entry)
    })

    it('returns null for missing entries', () => {
      const cache = new ComputedCache()

      const result = cache.get('row-1', 'total')

      expect(result).toBeNull()
    })

    it('returns null for expired entries', () => {
      const cache = new ComputedCache({ maxSize: 100, maxAge: 100 })
      const entry = createEntry(42, [], Date.now() - 200)

      cache.set('row-1', 'total', entry)
      const result = cache.get('row-1', 'total')

      expect(result).toBeNull()
    })

    it('overwrites existing entries', () => {
      const cache = new ComputedCache()
      const entry1 = createEntry(42)
      const entry2 = createEntry(100)

      cache.set('row-1', 'total', entry1)
      cache.set('row-1', 'total', entry2)
      const result = cache.get('row-1', 'total')

      expect(result?.value).toBe(100)
    })
  })

  describe('has', () => {
    it('returns true for existing entries', () => {
      const cache = new ComputedCache()
      cache.set('row-1', 'total', createEntry(42))

      expect(cache.has('row-1', 'total')).toBe(true)
    })

    it('returns false for missing entries', () => {
      const cache = new ComputedCache()

      expect(cache.has('row-1', 'total')).toBe(false)
    })

    it('returns false for expired entries', () => {
      const cache = new ComputedCache({ maxSize: 100, maxAge: 100 })
      cache.set('row-1', 'total', createEntry(42, [], Date.now() - 200))

      expect(cache.has('row-1', 'total')).toBe(false)
    })
  })

  describe('invalidate', () => {
    it('invalidates entries for a row', () => {
      const cache = new ComputedCache()
      cache.set('row-1', 'total', createEntry(42))
      cache.set('row-1', 'avg', createEntry(21))

      cache.invalidate('row-1')

      expect(cache.get('row-1', 'total')).toBeNull()
      expect(cache.get('row-1', 'avg')).toBeNull()
    })

    it('invalidates dependent entries', () => {
      const cache = new ComputedCache()
      // row-1's total depends on row-2
      cache.set('row-1', 'total', createEntry(42, ['row-2']))

      cache.invalidate('row-2')

      expect(cache.get('row-1', 'total')).toBeNull()
    })

    it('does not affect unrelated entries', () => {
      const cache = new ComputedCache()
      cache.set('row-1', 'total', createEntry(42))
      cache.set('row-2', 'total', createEntry(100))

      cache.invalidate('row-1')

      expect(cache.get('row-2', 'total')?.value).toBe(100)
    })
  })

  describe('invalidateCell', () => {
    it('invalidates a specific cell', () => {
      const cache = new ComputedCache()
      cache.set('row-1', 'total', createEntry(42))
      cache.set('row-1', 'avg', createEntry(21))

      cache.invalidateCell('row-1', 'total')

      expect(cache.get('row-1', 'total')).toBeNull()
      expect(cache.get('row-1', 'avg')?.value).toBe(21)
    })
  })

  describe('clear', () => {
    it('removes all entries', () => {
      const cache = new ComputedCache()
      cache.set('row-1', 'total', createEntry(42))
      cache.set('row-2', 'total', createEntry(100))

      cache.clear()

      expect(cache.get('row-1', 'total')).toBeNull()
      expect(cache.get('row-2', 'total')).toBeNull()
    })
  })

  describe('LRU eviction', () => {
    it('evicts oldest entries when at capacity', () => {
      const cache = new ComputedCache({ maxSize: 3, maxAge: 60000 })

      cache.set('row-1', 'col', createEntry(1))
      cache.set('row-2', 'col', createEntry(2))
      cache.set('row-3', 'col', createEntry(3))
      cache.set('row-4', 'col', createEntry(4)) // Should evict row-1

      expect(cache.get('row-1', 'col')).toBeNull()
      expect(cache.get('row-2', 'col')?.value).toBe(2)
      expect(cache.get('row-3', 'col')?.value).toBe(3)
      expect(cache.get('row-4', 'col')?.value).toBe(4)
    })

    it('updates access order on get', () => {
      const cache = new ComputedCache({ maxSize: 3, maxAge: 60000 })

      cache.set('row-1', 'col', createEntry(1))
      cache.set('row-2', 'col', createEntry(2))
      cache.set('row-3', 'col', createEntry(3))

      // Access row-1 to make it most recently used
      cache.get('row-1', 'col')

      cache.set('row-4', 'col', createEntry(4)) // Should evict row-2 (oldest)

      expect(cache.get('row-1', 'col')?.value).toBe(1)
      expect(cache.get('row-2', 'col')).toBeNull()
    })
  })

  describe('statistics', () => {
    it('tracks hits and misses', () => {
      const cache = new ComputedCache()
      cache.set('row-1', 'col', createEntry(42))

      cache.get('row-1', 'col') // hit
      cache.get('row-1', 'col') // hit
      cache.get('row-2', 'col') // miss

      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(0.667, 2)
    })

    it('tracks evictions', () => {
      const cache = new ComputedCache({ maxSize: 2, maxAge: 60000 })

      cache.set('row-1', 'col', createEntry(1))
      cache.set('row-2', 'col', createEntry(2))
      cache.set('row-3', 'col', createEntry(3)) // evicts row-1

      const stats = cache.getStats()
      expect(stats.evictions).toBe(1)
    })

    it('tracks invalidations', () => {
      const cache = new ComputedCache()
      cache.set('row-1', 'col', createEntry(42))
      cache.set('row-2', 'col', createEntry(100))

      cache.invalidate('row-1')

      const stats = cache.getStats()
      expect(stats.invalidations).toBe(1)
    })

    it('resets statistics', () => {
      const cache = new ComputedCache()
      cache.set('row-1', 'col', createEntry(42))
      cache.get('row-1', 'col')
      cache.get('row-2', 'col')

      cache.resetStats()

      const stats = cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })
  })
})

// ─── createComputedCache Tests ───────────────────────────────────────────────

describe('createComputedCache', () => {
  it('creates cache with default config', () => {
    const cache = createComputedCache()
    expect(cache).toBeInstanceOf(ComputedCache)
  })

  it('creates cache with custom config', () => {
    const cache = createComputedCache({ maxSize: 100 })
    // Fill to capacity
    for (let i = 0; i < 101; i++) {
      cache.set(`row-${i}`, 'col', createEntry(i))
    }
    // First entry should be evicted
    expect(cache.get('row-0', 'col')).toBeNull()
  })
})

// ─── batchInvalidate Tests ───────────────────────────────────────────────────

describe('batchInvalidate', () => {
  it('invalidates multiple rows', () => {
    const cache = new ComputedCache()
    cache.set('row-1', 'col', createEntry(1))
    cache.set('row-2', 'col', createEntry(2))
    cache.set('row-3', 'col', createEntry(3))

    batchInvalidate(cache, ['row-1', 'row-2'])

    expect(cache.get('row-1', 'col')).toBeNull()
    expect(cache.get('row-2', 'col')).toBeNull()
    expect(cache.get('row-3', 'col')?.value).toBe(3)
  })
})

// ─── Hash Utilities Tests ────────────────────────────────────────────────────

describe('computeInputHash', () => {
  it('produces consistent hashes', () => {
    const hash1 = computeInputHash({ a: 1, b: 2 })
    const hash2 = computeInputHash({ a: 1, b: 2 })

    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different inputs', () => {
    const hash1 = computeInputHash({ a: 1 })
    const hash2 = computeInputHash({ a: 2 })

    expect(hash1).not.toBe(hash2)
  })
})

describe('isEntryValid', () => {
  it('returns true for matching inputs', () => {
    const inputs = { price: 10, quantity: 5 }
    const entry = createEntry(50)
    entry.inputHash = computeInputHash(inputs)

    expect(isEntryValid(entry, inputs)).toBe(true)
  })

  it('returns false for different inputs', () => {
    const entry = createEntry(50)
    entry.inputHash = computeInputHash({ price: 10, quantity: 5 })

    expect(isEntryValid(entry, { price: 20, quantity: 5 })).toBe(false)
  })
})

// ─── DEFAULT_COMPUTED_CACHE_CONFIG Tests ─────────────────────────────────────

describe('DEFAULT_COMPUTED_CACHE_CONFIG', () => {
  it('has reasonable defaults', () => {
    expect(DEFAULT_COMPUTED_CACHE_CONFIG.maxSize).toBe(10_000)
    expect(DEFAULT_COMPUTED_CACHE_CONFIG.maxAge).toBe(5 * 60 * 1000)
  })
})
