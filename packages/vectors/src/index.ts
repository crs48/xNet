/**
 * @xnetjs/vectors - Semantic Search and Embeddings
 *
 * Provides vector embeddings, HNSW index, and semantic search capabilities.
 *
 * @example
 * ```typescript
 * import { SemanticSearch, createSemanticSearch } from '@xnetjs/vectors'
 *
 * const search = createSemanticSearch({ useMockModel: true })
 * await search.initialize()
 *
 * await search.indexDocument('doc1', 'The quick brown fox...')
 * await search.indexDocument('doc2', 'Machine learning is...')
 *
 * const results = await search.search('animals')
 * // [{ id: 'doc1', score: 0.85 }]
 * ```
 */

// Embedding model
export {
  loadEmbeddingModel,
  MockEmbeddingModel,
  cosineSimilarity,
  euclideanDistance
} from './embedding.js'

export type { EmbeddingModel, EmbeddingModelConfig } from './embedding.js'

// Vector index
export { VectorIndex, LinearVectorIndex, createVectorIndex } from './hnsw.js'

export type { VectorIndexConfig, SearchResult, MetricType } from './hnsw.js'

// Semantic search
export { SemanticSearch, createSemanticSearch } from './search.js'

export type {
  SemanticSearchConfig,
  IndexedDocument,
  DocumentSearchResult,
  TelemetryReporter as VectorsTelemetryReporter
} from './search.js'

// Hybrid search
export { HybridSearch, SimpleKeywordSearch, createHybridSearch } from './hybrid.js'

export type { HybridSearchConfig, HybridSearchResult, KeywordSearchProvider } from './hybrid.js'
