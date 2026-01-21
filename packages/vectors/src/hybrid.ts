/**
 * Hybrid Search - Combines Vector and Keyword Search
 *
 * Uses Reciprocal Rank Fusion (RRF) to combine results from
 * semantic search and keyword search for better relevance.
 */

import type { SemanticSearch, DocumentSearchResult } from './search.js'

/**
 * Keyword search interface (to be implemented by consumer)
 */
export interface KeywordSearchProvider {
  /** Search documents by keyword */
  search(query: string, maxResults?: number): Promise<Array<{ id: string; score?: number }>>
}

/**
 * Hybrid search configuration
 */
export interface HybridSearchConfig {
  /** Weight for vector search results (0-1, default: 0.5) */
  vectorWeight?: number
  /** Weight for keyword search results (0-1, default: 0.5) */
  keywordWeight?: number
  /** RRF constant k (default: 60) */
  rrfK?: number
  /** Minimum combined score */
  minScore?: number
  /** Maximum results to return */
  maxResults?: number
}

/**
 * Hybrid search result
 */
export interface HybridSearchResult {
  id: string
  /** Combined RRF score */
  score: number
  /** Vector search score (if found) */
  vectorScore?: number
  /** Keyword search score (if found) */
  keywordScore?: number
  /** Vector search rank (if found) */
  vectorRank?: number
  /** Keyword search rank (if found) */
  keywordRank?: number
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<HybridSearchConfig> = {
  vectorWeight: 0.5,
  keywordWeight: 0.5,
  rrfK: 60,
  minScore: 0,
  maxResults: 20
}

/**
 * Hybrid Search combining vector and keyword search
 *
 * @example
 * ```typescript
 * const hybrid = new HybridSearch(semanticSearch, keywordProvider)
 *
 * const results = await hybrid.search('machine learning concepts', {
 *   vectorWeight: 0.7,
 *   keywordWeight: 0.3
 * })
 * ```
 */
export class HybridSearch {
  private semanticSearch: SemanticSearch
  private keywordProvider: KeywordSearchProvider

  constructor(semanticSearch: SemanticSearch, keywordProvider: KeywordSearchProvider) {
    this.semanticSearch = semanticSearch
    this.keywordProvider = keywordProvider
  }

  /**
   * Perform hybrid search
   */
  async search(query: string, config: HybridSearchConfig = {}): Promise<HybridSearchResult[]> {
    const { vectorWeight, keywordWeight, rrfK, minScore, maxResults } = {
      ...DEFAULT_CONFIG,
      ...config
    }

    // Normalize weights
    const totalWeight = vectorWeight + keywordWeight
    const normVectorWeight = vectorWeight / totalWeight
    const normKeywordWeight = keywordWeight / totalWeight

    // Run both searches in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      this.semanticSearch.search(query, { maxResults: maxResults * 2 }),
      this.keywordProvider.search(query, maxResults * 2)
    ])

    // Calculate RRF scores
    const scores = new Map<
      string,
      {
        vectorScore?: number
        keywordScore?: number
        vectorRank?: number
        keywordRank?: number
      }
    >()

    // Add vector search results
    vectorResults.forEach((result, rank) => {
      scores.set(result.id, {
        vectorScore: result.score,
        vectorRank: rank + 1
      })
    })

    // Add keyword search results
    keywordResults.forEach((result, rank) => {
      const existing = scores.get(result.id) || {}
      scores.set(result.id, {
        ...existing,
        keywordScore: result.score,
        keywordRank: rank + 1
      })
    })

    // Calculate combined RRF scores
    const results: HybridSearchResult[] = []

    for (const [id, data] of scores.entries()) {
      let rrfScore = 0

      if (data.vectorRank !== undefined) {
        rrfScore += normVectorWeight / (rrfK + data.vectorRank)
      }

      if (data.keywordRank !== undefined) {
        rrfScore += normKeywordWeight / (rrfK + data.keywordRank)
      }

      if (rrfScore >= minScore) {
        results.push({
          id,
          score: rrfScore,
          vectorScore: data.vectorScore,
          keywordScore: data.keywordScore,
          vectorRank: data.vectorRank,
          keywordRank: data.keywordRank
        })
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, maxResults)
  }

  /**
   * Search with vector only (convenience method)
   */
  async vectorSearch(
    query: string,
    options?: { maxResults?: number; minScore?: number }
  ): Promise<DocumentSearchResult[]> {
    return this.semanticSearch.search(query, options)
  }

  /**
   * Search with keywords only (convenience method)
   */
  async keywordSearch(
    query: string,
    maxResults?: number
  ): Promise<Array<{ id: string; score?: number }>> {
    return this.keywordProvider.search(query, maxResults)
  }
}

/**
 * Simple in-memory keyword search provider for testing
 */
export class SimpleKeywordSearch implements KeywordSearchProvider {
  private documents: Map<string, string> = new Map()

  /**
   * Add document to keyword index
   */
  addDocument(id: string, content: string): void {
    this.documents.set(id, content.toLowerCase())
  }

  /**
   * Remove document from keyword index
   */
  removeDocument(id: string): boolean {
    return this.documents.delete(id)
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.documents.clear()
  }

  /**
   * Search documents by keyword
   */
  async search(query: string, maxResults = 20): Promise<Array<{ id: string; score: number }>> {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (queryTerms.length === 0) return []

    const results: Array<{ id: string; score: number }> = []

    for (const [id, content] of this.documents.entries()) {
      let matchCount = 0
      let totalFrequency = 0

      for (const term of queryTerms) {
        if (content.includes(term)) {
          matchCount++
          // Count occurrences
          const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
          const matches = content.match(regex)
          totalFrequency += matches ? matches.length : 0
        }
      }

      if (matchCount > 0) {
        // Score based on term coverage and frequency
        const coverage = matchCount / queryTerms.length
        const frequency = Math.min(totalFrequency / 10, 1) // Normalize frequency
        const score = coverage * 0.7 + frequency * 0.3

        results.push({ id, score })
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, maxResults)
  }
}

/**
 * Create a hybrid search instance
 */
export function createHybridSearch(
  semanticSearch: SemanticSearch,
  keywordProvider: KeywordSearchProvider
): HybridSearch {
  return new HybridSearch(semanticSearch, keywordProvider)
}
