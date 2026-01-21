/**
 * Tests for HNSW vector index
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { VectorIndex, LinearVectorIndex, createVectorIndex } from '../hnsw'

describe('LinearVectorIndex', () => {
  let index: LinearVectorIndex

  beforeEach(() => {
    index = new LinearVectorIndex({ dimensions: 3, metric: 'cosine' })
  })

  describe('add', () => {
    it('should add vectors', () => {
      index.add('a', new Float32Array([1, 0, 0]))
      index.add('b', new Float32Array([0, 1, 0]))
      expect(index.size()).toBe(2)
    })

    it('should update existing vectors', () => {
      index.add('a', new Float32Array([1, 0, 0]))
      index.add('a', new Float32Array([0, 1, 0]))
      expect(index.size()).toBe(1)
    })

    it('should throw on dimension mismatch', () => {
      expect(() => index.add('a', new Float32Array([1, 0]))).toThrow('dimension mismatch')
    })
  })

  describe('remove', () => {
    it('should remove vectors', () => {
      index.add('a', new Float32Array([1, 0, 0]))
      expect(index.remove('a')).toBe(true)
      expect(index.size()).toBe(0)
    })

    it('should return false for non-existent vectors', () => {
      expect(index.remove('nonexistent')).toBe(false)
    })
  })

  describe('has', () => {
    it('should check existence', () => {
      index.add('a', new Float32Array([1, 0, 0]))
      expect(index.has('a')).toBe(true)
      expect(index.has('b')).toBe(false)
    })
  })

  describe('search', () => {
    beforeEach(() => {
      // Add some test vectors
      index.add('x-axis', new Float32Array([1, 0, 0]))
      index.add('y-axis', new Float32Array([0, 1, 0]))
      index.add('z-axis', new Float32Array([0, 0, 1]))
      index.add('xy-diag', new Float32Array([1, 1, 0]))
    })

    it('should find exact match', () => {
      const results = index.search(new Float32Array([1, 0, 0]), 1)
      expect(results[0].id).toBe('x-axis')
      expect(results[0].score).toBeCloseTo(1, 5)
    })

    it('should find k nearest neighbors', () => {
      const results = index.search(new Float32Array([1, 0, 0]), 3)
      expect(results.length).toBe(3)
      // x-axis should be first (exact match)
      expect(results[0].id).toBe('x-axis')
    })

    it('should return results sorted by score', () => {
      const results = index.search(new Float32Array([1, 1, 0]), 4)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
      }
    })

    it('should filter by threshold', () => {
      const results = index.search(new Float32Array([1, 0, 0]), 10, 0.9)
      results.forEach((r) => {
        expect(r.score).toBeGreaterThanOrEqual(0.9)
      })
    })

    it('should handle empty index', () => {
      const emptyIndex = new LinearVectorIndex({ dimensions: 3 })
      const results = emptyIndex.search(new Float32Array([1, 0, 0]), 5)
      expect(results).toEqual([])
    })

    it('should throw on query dimension mismatch', () => {
      expect(() => index.search(new Float32Array([1, 0]), 1)).toThrow('dimension mismatch')
    })
  })

  describe('serialization', () => {
    it('should serialize and deserialize', () => {
      index.add('a', new Float32Array([1, 0, 0]))
      index.add('b', new Float32Array([0, 1, 0]))

      const data = index.serialize()
      const restored = LinearVectorIndex.deserialize(data)

      expect(restored.size()).toBe(2)
      expect(restored.has('a')).toBe(true)
      expect(restored.has('b')).toBe(true)

      // Search should work on restored index
      const results = restored.search(new Float32Array([1, 0, 0]), 1)
      expect(results[0].id).toBe('a')
    })
  })

  describe('clear', () => {
    it('should remove all vectors', () => {
      index.add('a', new Float32Array([1, 0, 0]))
      index.add('b', new Float32Array([0, 1, 0]))
      index.clear()
      expect(index.size()).toBe(0)
    })
  })

  describe('getIds', () => {
    it('should return all IDs', () => {
      index.add('a', new Float32Array([1, 0, 0]))
      index.add('b', new Float32Array([0, 1, 0]))
      const ids = index.getIds()
      expect(ids).toContain('a')
      expect(ids).toContain('b')
      expect(ids.length).toBe(2)
    })
  })
})

describe('VectorIndex', () => {
  it('should work as wrapper for LinearVectorIndex', () => {
    const index = createVectorIndex({ dimensions: 3 })

    index.add('a', new Float32Array([1, 0, 0]))
    index.add('b', new Float32Array([0, 1, 0]))

    expect(index.size()).toBe(2)

    const results = index.search(new Float32Array([1, 0, 0]), 1)
    expect(results[0].id).toBe('a')
  })

  it('should serialize and deserialize', () => {
    const index = createVectorIndex({ dimensions: 3 })
    index.add('a', new Float32Array([1, 0, 0]))

    const data = index.serialize()
    const restored = VectorIndex.deserialize(data)

    expect(restored.size()).toBe(1)
    expect(restored.has('a')).toBe(true)
  })
})

describe('L2 squared metric', () => {
  it('should calculate L2 distance correctly', () => {
    const index = new LinearVectorIndex({ dimensions: 3, metric: 'l2sq' })

    index.add('origin', new Float32Array([0, 0, 0]))
    index.add('near', new Float32Array([1, 0, 0]))
    index.add('far', new Float32Array([10, 0, 0]))

    const results = index.search(new Float32Array([0, 0, 0]), 3)

    // Origin should be exact match (highest score)
    expect(results[0].id).toBe('origin')
    // Near should be closer than far
    expect(results[1].id).toBe('near')
    expect(results[2].id).toBe('far')
  })
})
