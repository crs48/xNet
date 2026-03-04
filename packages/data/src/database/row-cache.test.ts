/**
 * @xnetjs/data - Row cache tests.
 */

import type { CachedRow } from './row-cache'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RowCache } from './row-cache'

const createRow = (id: string, databaseId = 'db-1'): CachedRow => ({
  id,
  databaseId,
  sortKey: 'a0',
  cells: { title: `Row ${id}` },
  createdAt: Date.now(),
  createdBy: 'did:key:test'
})

describe('RowCache', () => {
  describe('get/set', () => {
    it('stores and retrieves rows', () => {
      const cache = new RowCache()
      const row = createRow('row-1')

      cache.set('row-1', row)
      const retrieved = cache.get('row-1')

      expect(retrieved).toEqual(row)
    })

    it('returns undefined for missing rows', () => {
      const cache = new RowCache()
      expect(cache.get('missing')).toBeUndefined()
    })

    it('tracks cache hits and misses', () => {
      const cache = new RowCache()
      cache.set('row-1', createRow('row-1'))

      cache.get('row-1') // hit
      cache.get('row-1') // hit
      cache.get('missing') // miss

      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
    })
  })

  describe('has', () => {
    it('returns true for cached rows', () => {
      const cache = new RowCache()
      cache.set('row-1', createRow('row-1'))

      expect(cache.has('row-1')).toBe(true)
    })

    it('returns false for missing rows', () => {
      const cache = new RowCache()
      expect(cache.has('missing')).toBe(false)
    })
  })

  describe('getMany/setMany', () => {
    it('stores and retrieves multiple rows', () => {
      const cache = new RowCache()
      const rows = [createRow('row-1'), createRow('row-2'), createRow('row-3')]

      cache.setMany(rows)
      const retrieved = cache.getMany(['row-1', 'row-2', 'row-3'])

      expect(retrieved.size).toBe(3)
      expect(retrieved.get('row-1')).toEqual(rows[0])
    })

    it('only returns found rows', () => {
      const cache = new RowCache()
      cache.set('row-1', createRow('row-1'))

      const retrieved = cache.getMany(['row-1', 'row-2', 'row-3'])

      expect(retrieved.size).toBe(1)
      expect(retrieved.has('row-1')).toBe(true)
    })
  })

  describe('invalidate', () => {
    it('removes a single row', () => {
      const cache = new RowCache()
      cache.set('row-1', createRow('row-1'))

      cache.invalidate('row-1')

      expect(cache.has('row-1')).toBe(false)
    })

    it('removes multiple rows', () => {
      const cache = new RowCache()
      cache.setMany([createRow('row-1'), createRow('row-2'), createRow('row-3')])

      cache.invalidateMany(['row-1', 'row-2'])

      expect(cache.has('row-1')).toBe(false)
      expect(cache.has('row-2')).toBe(false)
      expect(cache.has('row-3')).toBe(true)
    })
  })

  describe('invalidateDatabase', () => {
    it('removes all rows for a database', () => {
      const cache = new RowCache()
      cache.setMany([
        createRow('row-1', 'db-1'),
        createRow('row-2', 'db-1'),
        createRow('row-3', 'db-2')
      ])

      cache.invalidateDatabase('db-1')

      expect(cache.has('row-1')).toBe(false)
      expect(cache.has('row-2')).toBe(false)
      expect(cache.has('row-3')).toBe(true)
    })
  })

  describe('clear', () => {
    it('removes all rows', () => {
      const cache = new RowCache()
      cache.setMany([createRow('row-1'), createRow('row-2'), createRow('row-3')])

      cache.clear()

      expect(cache.size).toBe(0)
    })
  })

  describe('LRU eviction', () => {
    it('evicts oldest entries when at capacity', () => {
      const cache = new RowCache({ maxSize: 3 })

      cache.set('row-1', createRow('row-1'))
      cache.set('row-2', createRow('row-2'))
      cache.set('row-3', createRow('row-3'))
      cache.set('row-4', createRow('row-4')) // Should evict row-1

      expect(cache.has('row-1')).toBe(false)
      expect(cache.has('row-2')).toBe(true)
      expect(cache.has('row-3')).toBe(true)
      expect(cache.has('row-4')).toBe(true)
    })

    it('moves accessed entries to end', () => {
      const cache = new RowCache({ maxSize: 3 })

      cache.set('row-1', createRow('row-1'))
      cache.set('row-2', createRow('row-2'))
      cache.set('row-3', createRow('row-3'))

      // Access row-1, making it most recently used
      cache.get('row-1')

      // Add row-4, should evict row-2 (now oldest)
      cache.set('row-4', createRow('row-4'))

      expect(cache.has('row-1')).toBe(true)
      expect(cache.has('row-2')).toBe(false)
      expect(cache.has('row-3')).toBe(true)
      expect(cache.has('row-4')).toBe(true)
    })

    it('tracks evictions', () => {
      const cache = new RowCache({ maxSize: 2 })

      cache.set('row-1', createRow('row-1'))
      cache.set('row-2', createRow('row-2'))
      cache.set('row-3', createRow('row-3'))
      cache.set('row-4', createRow('row-4'))

      const stats = cache.getStats()
      expect(stats.evictions).toBe(2)
    })
  })

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('expires old entries on get', () => {
      const cache = new RowCache({ maxAge: 1000 }) // 1 second

      cache.set('row-1', createRow('row-1'))

      // Advance time past TTL
      vi.advanceTimersByTime(2000)

      expect(cache.get('row-1')).toBeUndefined()
    })

    it('expires old entries on has', () => {
      const cache = new RowCache({ maxAge: 1000 })

      cache.set('row-1', createRow('row-1'))

      vi.advanceTimersByTime(2000)

      expect(cache.has('row-1')).toBe(false)
    })

    it('keeps fresh entries', () => {
      const cache = new RowCache({ maxAge: 1000 })

      cache.set('row-1', createRow('row-1'))

      vi.advanceTimersByTime(500) // Half the TTL

      expect(cache.get('row-1')).toBeDefined()
    })

    afterEach(() => {
      vi.useRealTimers()
    })
  })

  describe('prune', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('removes expired entries', () => {
      const cache = new RowCache({ maxAge: 1000 })

      cache.set('row-1', createRow('row-1'))
      cache.set('row-2', createRow('row-2'))

      vi.advanceTimersByTime(2000)

      cache.set('row-3', createRow('row-3')) // Fresh entry

      const pruned = cache.prune()

      expect(pruned).toBe(2)
      expect(cache.size).toBe(1)
      expect(cache.has('row-3')).toBe(true)
    })

    afterEach(() => {
      vi.useRealTimers()
    })
  })

  describe('statistics', () => {
    it('calculates hit rate', () => {
      const cache = new RowCache()
      cache.set('row-1', createRow('row-1'))

      cache.get('row-1') // hit
      cache.get('row-1') // hit
      cache.get('missing') // miss
      cache.get('missing') // miss

      expect(cache.hitRate).toBe(0.5)
    })

    it('returns 0 hit rate with no requests', () => {
      const cache = new RowCache()
      expect(cache.hitRate).toBe(0)
    })

    it('resets statistics', () => {
      const cache = new RowCache()
      cache.set('row-1', createRow('row-1'))
      cache.get('row-1')
      cache.get('missing')

      cache.resetStats()

      const stats = cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })
  })

  describe('getIdsForDatabase', () => {
    it('returns all cached IDs for a database', () => {
      const cache = new RowCache()
      cache.setMany([
        createRow('row-1', 'db-1'),
        createRow('row-2', 'db-1'),
        createRow('row-3', 'db-2')
      ])

      const ids = cache.getIdsForDatabase('db-1')

      expect(ids).toHaveLength(2)
      expect(ids).toContain('row-1')
      expect(ids).toContain('row-2')
    })
  })

  describe('configuration', () => {
    it('uses default config', () => {
      const cache = new RowCache()
      expect(cache.size).toBe(0)
    })

    it('accepts custom config', () => {
      const cache = new RowCache({ maxSize: 5 })

      for (let i = 0; i < 10; i++) {
        cache.set(`row-${i}`, createRow(`row-${i}`))
      }

      expect(cache.size).toBe(5)
    })
  })
})
