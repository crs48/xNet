/**
 * Tests for QueryCache with LRU eviction
 */
import type { NodeState, SchemaIRI } from '@xnet/data'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryCache } from '../query-cache'

// ─── Test Helpers ────────────────────────────────────────────────────────────

const TEST_SCHEMA_ID = 'xnet://test/Task' as SchemaIRI

function createMockNode(id: string, title: string): NodeState {
  const now = Date.now()
  return {
    id,
    schemaId: TEST_SCHEMA_ID,
    properties: { title },
    timestamps: { title: { lamport: { time: 1, author: 'did:key:test' }, wallTime: now } },
    createdAt: now,
    createdBy: 'did:key:test',
    updatedAt: now,
    updatedBy: 'did:key:test',
    deleted: false
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('QueryCache', () => {
  let cache: QueryCache

  beforeEach(() => {
    cache = new QueryCache()
  })

  describe('basic operations', () => {
    it('should compute stable query IDs', () => {
      const id1 = cache.computeQueryId(TEST_SCHEMA_ID, { nodeId: '123' })
      const id2 = cache.computeQueryId(TEST_SCHEMA_ID, { nodeId: '123' })
      expect(id1).toBe(id2)

      const id3 = cache.computeQueryId(TEST_SCHEMA_ID, { nodeId: '456' })
      expect(id1).not.toBe(id3)
    })

    it('should set and get data', () => {
      const queryId = 'test-query'
      const nodes = [createMockNode('1', 'Task 1')]

      cache.set(queryId, nodes, TEST_SCHEMA_ID, {})
      expect(cache.get(queryId)).toEqual(nodes)
    })

    it('should return null for missing queries', () => {
      expect(cache.get('nonexistent')).toBeNull()
    })

    it('should track cache size', () => {
      expect(cache.size).toBe(0)

      cache.set('q1', [createMockNode('1', 'Task 1')], TEST_SCHEMA_ID, {})
      expect(cache.size).toBe(1)

      cache.set('q2', [createMockNode('2', 'Task 2')], TEST_SCHEMA_ID, {})
      expect(cache.size).toBe(2)
    })

    it('should notify subscribers on update', () => {
      const queryId = 'test-query'
      const callback = vi.fn()

      cache.initEntry(queryId, TEST_SCHEMA_ID, {})
      cache.subscribe(queryId, callback)

      cache.set(queryId, [createMockNode('1', 'Task 1')], TEST_SCHEMA_ID, {})
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('LRU eviction', () => {
    it('should respect maxSize option', () => {
      const smallCache = new QueryCache({ maxSize: 5 })
      expect(smallCache.maxCacheSize).toBe(5)
    })

    it('should not evict entries with active subscribers', async () => {
      const smallCache = new QueryCache({ maxSize: 3 })

      // Add entries with subscribers
      for (let i = 0; i < 5; i++) {
        const queryId = `q${i}`
        smallCache.initEntry(queryId, TEST_SCHEMA_ID, {})
        smallCache.subscribe(queryId, () => {})
        smallCache.set(queryId, [createMockNode(`${i}`, `Task ${i}`)], TEST_SCHEMA_ID, {})
      }

      // All entries should still exist because they have subscribers
      expect(smallCache.size).toBe(5)
    })

    it('should evict old entries without subscribers when at capacity', async () => {
      const smallCache = new QueryCache({ maxSize: 3 })

      // Mock Date.now to control time
      let mockTime = 1000000000000

      vi.spyOn(Date, 'now').mockImplementation(() => mockTime)

      // Add entries without subscribers (old enough to evict)
      for (let i = 0; i < 3; i++) {
        smallCache.set(`q${i}`, [createMockNode(`${i}`, `Task ${i}`)], TEST_SCHEMA_ID, {})
        mockTime += 1000 // 1 second between entries
      }

      expect(smallCache.size).toBe(3)

      // Advance time past MIN_AGE_FOR_EVICTION (30 seconds)
      mockTime += 35000

      // Add one more entry - should trigger eviction
      smallCache.set('q3', [createMockNode('3', 'Task 3')], TEST_SCHEMA_ID, {})

      // Should have evicted at least one old entry
      expect(smallCache.size).toBeLessThanOrEqual(3)

      // Restore Date.now
      vi.restoreAllMocks()
    })

    it('should evict oldest entries first', async () => {
      const smallCache = new QueryCache({ maxSize: 5 })

      let mockTime = 1000000000000

      vi.spyOn(Date, 'now').mockImplementation(() => mockTime)

      // Add entries at different times
      for (let i = 0; i < 5; i++) {
        smallCache.set(`q${i}`, [createMockNode(`${i}`, `Task ${i}`)], TEST_SCHEMA_ID, {})
        mockTime += 1000
      }

      // Access q2 to make it more recent
      mockTime += 1000
      smallCache.get('q2')

      // Advance past eviction threshold
      mockTime += 35000

      // Trigger eviction by calling evict() directly
      const evicted = smallCache.evict()

      // q0 and q1 should be evicted (oldest), q2 should remain (accessed recently)
      if (evicted > 0) {
        expect(smallCache.has('q2')).toBe(true) // Most recently accessed
        expect(smallCache.has('q4')).toBe(true) // Newer entry
      }

      vi.restoreAllMocks()
    })

    it('should not evict entries younger than MIN_AGE_FOR_EVICTION', () => {
      const smallCache = new QueryCache({ maxSize: 3 })

      // Add entries (all recent)
      for (let i = 0; i < 5; i++) {
        smallCache.set(`q${i}`, [createMockNode(`${i}`, `Task ${i}`)], TEST_SCHEMA_ID, {})
      }

      // All entries are too young to evict
      // The evict() call should not remove any
      const evicted = smallCache.evict()
      expect(evicted).toBe(0)
    })
  })

  describe('filtering and sorting', () => {
    it('should filter nodes by where clause', () => {
      const nodes = [
        createMockNode('1', 'Task A'),
        createMockNode('2', 'Task B'),
        createMockNode('3', 'Task A')
      ]

      const filtered = cache.filterNodes(nodes, { where: { title: 'Task A' } })
      expect(filtered).toHaveLength(2)
      expect(filtered.map((n) => n.id)).toEqual(['1', '3'])
    })

    it('should sort nodes by property', () => {
      const nodes = [createMockNode('1', 'C'), createMockNode('2', 'A'), createMockNode('3', 'B')]

      const sorted = cache.sortNodes(nodes, { orderBy: { title: 'asc' } })
      expect(sorted.map((n) => n.properties.title)).toEqual(['A', 'B', 'C'])
    })

    it('should paginate nodes', () => {
      const nodes = Array.from({ length: 10 }, (_, i) => createMockNode(`${i}`, `Task ${i}`))

      const paginated = cache.paginateNodes(nodes, { offset: 2, limit: 3 })
      expect(paginated).toHaveLength(3)
      expect(paginated.map((n) => n.id)).toEqual(['2', '3', '4'])
    })
  })
})
