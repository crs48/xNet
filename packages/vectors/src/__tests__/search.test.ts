/**
 * Tests for semantic search
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SemanticSearch, createSemanticSearch } from '../search'

describe('SemanticSearch', () => {
  let search: SemanticSearch

  beforeEach(async () => {
    search = createSemanticSearch({ useMockModel: true })
    await search.initialize()
  })

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(search.isInitialized()).toBe(true)
    })

    it('should not reinitialize if already initialized', async () => {
      await search.initialize() // Should not throw
      expect(search.isInitialized()).toBe(true)
    })

    it('should throw if not initialized', async () => {
      const uninitSearch = createSemanticSearch({ useMockModel: true })
      await expect(uninitSearch.search('test')).rejects.toThrow('not initialized')
    })
  })

  describe('indexDocument', () => {
    it('should index a document', async () => {
      const doc = await search.indexDocument('doc1', 'Hello world')
      expect(doc.id).toBe('doc1')
      expect(doc.chunkCount).toBeGreaterThan(0)
      expect(search.documentCount()).toBe(1)
    })

    it('should index multiple documents', async () => {
      await search.indexDocument('doc1', 'Hello world')
      await search.indexDocument('doc2', 'Goodbye world')
      expect(search.documentCount()).toBe(2)
    })

    it('should replace existing document', async () => {
      await search.indexDocument('doc1', 'Hello')
      await search.indexDocument('doc1', 'Goodbye')
      expect(search.documentCount()).toBe(1)
    })

    it('should chunk long documents', async () => {
      const longContent = 'Lorem ipsum dolor sit amet. '.repeat(100)
      const doc = await search.indexDocument('doc1', longContent)
      expect(doc.chunkCount).toBeGreaterThan(1)
    })
  })

  describe('indexDocuments', () => {
    it('should index batch of documents', async () => {
      const docs = await search.indexDocuments([
        { id: 'doc1', content: 'Hello' },
        { id: 'doc2', content: 'World' },
        { id: 'doc3', content: 'Test' }
      ])
      expect(docs.length).toBe(3)
      expect(search.documentCount()).toBe(3)
    })
  })

  describe('removeDocument', () => {
    it('should remove a document', async () => {
      await search.indexDocument('doc1', 'Hello world')
      expect(search.removeDocument('doc1')).toBe(true)
      expect(search.documentCount()).toBe(0)
    })

    it('should return false for non-existent document', () => {
      expect(search.removeDocument('nonexistent')).toBe(false)
    })
  })

  describe('hasDocument', () => {
    it('should check document existence', async () => {
      await search.indexDocument('doc1', 'Hello')
      expect(search.hasDocument('doc1')).toBe(true)
      expect(search.hasDocument('doc2')).toBe(false)
    })
  })

  describe('getDocument', () => {
    it('should return document info', async () => {
      await search.indexDocument('doc1', 'Hello')
      const doc = search.getDocument('doc1')
      expect(doc).toBeDefined()
      expect(doc?.id).toBe('doc1')
    })

    it('should return undefined for non-existent document', () => {
      expect(search.getDocument('nonexistent')).toBeUndefined()
    })
  })

  describe('search', () => {
    beforeEach(async () => {
      await search.indexDocument('animals', 'The quick brown fox jumps over the lazy dog')
      await search.indexDocument('tech', 'Machine learning is a subset of artificial intelligence')
      await search.indexDocument('pets', 'Dogs and cats are popular household pets')
    })

    it('should return search results', async () => {
      // Use minScore: 0 because mock embeddings are random and may not meet default threshold
      const results = await search.search('fox', { minScore: 0 })
      expect(results.length).toBeGreaterThan(0)
    })

    it('should return results with scores', async () => {
      const results = await search.search('fox')
      results.forEach((r) => {
        expect(r.id).toBeDefined()
        expect(typeof r.score).toBe('number')
        expect(r.score).toBeGreaterThanOrEqual(0)
        expect(r.score).toBeLessThanOrEqual(1)
      })
    })

    it('should respect maxResults option', async () => {
      const results = await search.search('the', { maxResults: 2 })
      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('should respect minScore option', async () => {
      const results = await search.search('random query', { minScore: 0.9 })
      results.forEach((r) => {
        expect(r.score).toBeGreaterThanOrEqual(0.9)
      })
    })

    it('should handle empty index', async () => {
      const emptySearch = createSemanticSearch({ useMockModel: true })
      await emptySearch.initialize()
      const results = await emptySearch.search('test')
      expect(results).toEqual([])
    })
  })

  describe('vectorCount', () => {
    it('should return total vector count', async () => {
      await search.indexDocument('doc1', 'Hello world')
      expect(search.vectorCount()).toBeGreaterThan(0)
    })
  })

  describe('clear', () => {
    it('should remove all documents', async () => {
      await search.indexDocument('doc1', 'Hello')
      await search.indexDocument('doc2', 'World')
      search.clear()
      expect(search.documentCount()).toBe(0)
      expect(search.vectorCount()).toBe(0)
    })
  })

  describe('serialization', () => {
    it('should serialize and restore state', async () => {
      await search.indexDocument('doc1', 'Hello world')
      await search.indexDocument('doc2', 'Goodbye world')

      const data = search.serialize()

      const newSearch = createSemanticSearch({ useMockModel: true })
      await newSearch.initialize()
      newSearch.restore(data)

      expect(newSearch.documentCount()).toBe(2)
      expect(newSearch.hasDocument('doc1')).toBe(true)
      expect(newSearch.hasDocument('doc2')).toBe(true)
    })
  })
})
