/**
 * Tests for embedding model
 */

import { describe, it, expect } from 'vitest'
import { MockEmbeddingModel, cosineSimilarity, euclideanDistance } from '../embedding'

describe('MockEmbeddingModel', () => {
  const model = new MockEmbeddingModel(384)

  it('should generate embeddings with correct dimensions', async () => {
    const embedding = await model.embed('hello world')
    expect(embedding.length).toBe(384)
  })

  it('should generate normalized embeddings', async () => {
    const embedding = await model.embed('test text')
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
    expect(norm).toBeCloseTo(1, 5)
  })

  it('should generate deterministic embeddings', async () => {
    const embedding1 = await model.embed('hello world')
    const embedding2 = await model.embed('hello world')
    expect(Array.from(embedding1)).toEqual(Array.from(embedding2))
  })

  it('should generate different embeddings for different text', async () => {
    const embedding1 = await model.embed('hello')
    const embedding2 = await model.embed('world')
    expect(Array.from(embedding1)).not.toEqual(Array.from(embedding2))
  })

  it('should embed batch of texts', async () => {
    const texts = ['hello', 'world', 'test']
    const embeddings = await model.embedBatch(texts)
    expect(embeddings.length).toBe(3)
    embeddings.forEach((emb) => {
      expect(emb.length).toBe(384)
    })
  })

  it('should handle empty batch', async () => {
    const embeddings = await model.embedBatch([])
    expect(embeddings).toEqual([])
  })
})

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([1, 0, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5)
  })

  it('should return -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([-1, 0, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5)
  })

  it('should return 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([0, 1, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5)
  })

  it('should handle normalized vectors correctly', () => {
    const a = new Float32Array([0.6, 0.8, 0])
    const b = new Float32Array([0.8, 0.6, 0])
    const similarity = cosineSimilarity(a, b)
    expect(similarity).toBeGreaterThan(0.9) // Similar vectors
    expect(similarity).toBeLessThan(1)
  })

  it('should throw for mismatched dimensions', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([1, 2])
    expect(() => cosineSimilarity(a, b)).toThrow('Vectors must have same length')
  })
})

describe('euclideanDistance', () => {
  it('should return 0 for identical vectors', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([1, 2, 3])
    expect(euclideanDistance(a, b)).toBeCloseTo(0, 5)
  })

  it('should calculate distance correctly', () => {
    const a = new Float32Array([0, 0, 0])
    const b = new Float32Array([3, 4, 0])
    expect(euclideanDistance(a, b)).toBeCloseTo(5, 5) // 3-4-5 triangle
  })

  it('should be symmetric', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([4, 5, 6])
    expect(euclideanDistance(a, b)).toBeCloseTo(euclideanDistance(b, a), 5)
  })

  it('should throw for mismatched dimensions', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([1, 2])
    expect(() => euclideanDistance(a, b)).toThrow('Vectors must have same length')
  })
})
