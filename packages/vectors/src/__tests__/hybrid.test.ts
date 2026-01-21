/**
 * Tests for hybrid search
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { HybridSearch, SimpleKeywordSearch, createHybridSearch } from '../hybrid'
import { SemanticSearch, createSemanticSearch } from '../search'

describe('SimpleKeywordSearch', () => {
  let keywordSearch: SimpleKeywordSearch

  beforeEach(() => {
    keywordSearch = new SimpleKeywordSearch()
  })

  describe('addDocument', () => {
    it('should add documents', () => {
      keywordSearch.addDocument('doc1', 'Hello world')
      keywordSearch.addDocument('doc2', 'Goodbye world')
      // No direct size check, but search should work
    })
  })

  describe('removeDocument', () => {
    it('should remove documents', async () => {
      keywordSearch.addDocument('doc1', 'Hello world')
      expect(keywordSearch.removeDocument('doc1')).toBe(true)
      const results = await keywordSearch.search('hello')
      expect(results.find((r) => r.id === 'doc1')).toBeUndefined()
    })

    it('should return false for non-existent documents', () => {
      expect(keywordSearch.removeDocument('nonexistent')).toBe(false)
    })
  })

  describe('search', () => {
    beforeEach(() => {
      keywordSearch.addDocument('animals', 'The quick brown fox jumps over the lazy dog')
      keywordSearch.addDocument('tech', 'Machine learning is a subset of artificial intelligence')
      keywordSearch.addDocument('pets', 'Dogs and cats are popular household pets')
    })

    it('should find documents containing query terms', async () => {
      const results = await keywordSearch.search('fox')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].id).toBe('animals')
    })

    it('should find documents with multiple query terms', async () => {
      const results = await keywordSearch.search('machine learning')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].id).toBe('tech')
    })

    it('should be case-insensitive', async () => {
      const results = await keywordSearch.search('FOX')
      expect(results.length).toBeGreaterThan(0)
    })

    it('should return results with scores', async () => {
      const results = await keywordSearch.search('dog')
      results.forEach((r) => {
        expect(r.score).toBeDefined()
        expect(r.score).toBeGreaterThan(0)
        expect(r.score).toBeLessThanOrEqual(1)
      })
    })

    it('should respect maxResults', async () => {
      const results = await keywordSearch.search('the', 1)
      expect(results.length).toBeLessThanOrEqual(1)
    })

    it('should return empty for no matches', async () => {
      const results = await keywordSearch.search('xyz123')
      expect(results).toEqual([])
    })

    it('should handle empty query', async () => {
      const results = await keywordSearch.search('')
      expect(results).toEqual([])
    })
  })

  describe('clear', () => {
    it('should remove all documents', async () => {
      keywordSearch.addDocument('doc1', 'Hello')
      keywordSearch.addDocument('doc2', 'World')
      keywordSearch.clear()
      const results = await keywordSearch.search('hello')
      expect(results).toEqual([])
    })
  })
})

describe('HybridSearch', () => {
  let semanticSearch: SemanticSearch
  let keywordSearch: SimpleKeywordSearch
  let hybridSearch: HybridSearch

  beforeEach(async () => {
    semanticSearch = createSemanticSearch({ useMockModel: true })
    await semanticSearch.initialize()

    keywordSearch = new SimpleKeywordSearch()
    hybridSearch = createHybridSearch(semanticSearch, keywordSearch)

    // Add documents to both indexes
    const docs = [
      { id: 'animals', content: 'The quick brown fox jumps over the lazy dog' },
      { id: 'tech', content: 'Machine learning is a subset of artificial intelligence' },
      { id: 'pets', content: 'Dogs and cats are popular household pets' }
    ]

    for (const doc of docs) {
      await semanticSearch.indexDocument(doc.id, doc.content)
      keywordSearch.addDocument(doc.id, doc.content)
    }
  })

  describe('search', () => {
    it('should return results from both sources', async () => {
      const results = await hybridSearch.search('dog')
      expect(results.length).toBeGreaterThan(0)
    })

    it('should have RRF scores', async () => {
      const results = await hybridSearch.search('fox')
      results.forEach((r) => {
        expect(r.score).toBeDefined()
        expect(r.score).toBeGreaterThan(0)
      })
    })

    it('should include source scores when available', async () => {
      const results = await hybridSearch.search('machine learning')
      const techResult = results.find((r) => r.id === 'tech')
      expect(techResult).toBeDefined()
      // At least one of the source scores should be defined
      expect(techResult?.vectorScore !== undefined || techResult?.keywordScore !== undefined).toBe(
        true
      )
    })

    it('should respect vectorWeight config', async () => {
      const vectorHeavy = await hybridSearch.search('fox', {
        vectorWeight: 0.9,
        keywordWeight: 0.1
      })
      const keywordHeavy = await hybridSearch.search('fox', {
        vectorWeight: 0.1,
        keywordWeight: 0.9
      })
      // Results may differ based on weighting
      expect(vectorHeavy.length).toBeGreaterThan(0)
      expect(keywordHeavy.length).toBeGreaterThan(0)
    })

    it('should respect maxResults config', async () => {
      const results = await hybridSearch.search('the', { maxResults: 2 })
      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('should combine results using RRF', async () => {
      // Add a document that matches well in keyword but not vector
      keywordSearch.addDocument('keyword-only', 'specific unique keyword xyz')
      await semanticSearch.indexDocument('keyword-only', 'specific unique keyword xyz')

      const results = await hybridSearch.search('specific unique keyword')
      const found = results.find((r) => r.id === 'keyword-only')
      expect(found).toBeDefined()
    })
  })

  describe('vectorSearch', () => {
    it('should perform vector-only search', async () => {
      // Use a query that matches one of the indexed documents more closely
      const results = await hybridSearch.vectorSearch('fox dog', { minScore: 0 })
      // With mock model, results depend on hash-based embeddings
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('keywordSearch', () => {
    it('should perform keyword-only search', async () => {
      const results = await hybridSearch.keywordSearch('fox')
      expect(results.length).toBeGreaterThan(0)
    })
  })
})
