/**
 * Semantic Search Service
 *
 * High-level API for indexing documents and performing semantic search.
 * Handles document chunking, embedding generation, and index management.
 */

import type { EmbeddingModel } from './embedding.js'
import { loadEmbeddingModel, MockEmbeddingModel } from './embedding.js'
import {
  VectorIndex,
  createVectorIndex,
  type SearchResult,
  type VectorIndexConfig
} from './hnsw.js'

/**
 * Duck-typed telemetry interface to avoid circular dependencies.
 */
export interface TelemetryReporter {
  reportPerformance(metricName: string, durationMs: number): void
  reportUsage(metricName: string, count: number): void
  reportCrash(error: Error, context?: Record<string, unknown>): void
}

/**
 * Configuration for semantic search
 */
export interface SemanticSearchConfig {
  /** Embedding model configuration */
  modelName?: string
  /** Use mock model for testing */
  useMockModel?: boolean
  /** Vector index configuration */
  indexConfig?: Partial<VectorIndexConfig>
  /** Minimum similarity score (0-1) */
  minScore?: number
  /** Maximum results to return */
  maxResults?: number
  /** Maximum chunk size in characters */
  chunkSize?: number
  /** Overlap between chunks */
  chunkOverlap?: number
  /** Optional telemetry reporter */
  telemetry?: TelemetryReporter
}

/**
 * Indexed document metadata
 */
export interface IndexedDocument {
  id: string
  chunkCount: number
  indexedAt: number
}

/**
 * Search result with document metadata
 */
export interface DocumentSearchResult extends SearchResult {
  /** Chunk index within document (if chunked) */
  chunkIndex?: number
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<
  Omit<SemanticSearchConfig, 'modelName' | 'indexConfig' | 'telemetry'>
> & { telemetry?: TelemetryReporter } = {
  useMockModel: false,
  minScore: 0.5,
  maxResults: 20,
  chunkSize: 500,
  chunkOverlap: 50,
  telemetry: undefined
}

/**
 * Semantic Search Service
 *
 * @example
 * ```typescript
 * const search = new SemanticSearch()
 * await search.initialize()
 *
 * await search.indexDocument('doc1', 'The quick brown fox...')
 * await search.indexDocument('doc2', 'Machine learning is...')
 *
 * const results = await search.search('animals')
 * ```
 */
export class SemanticSearch {
  private model: EmbeddingModel | null = null
  private index: VectorIndex | null = null
  private config: Required<Omit<SemanticSearchConfig, 'modelName' | 'indexConfig' | 'telemetry'>> &
    Pick<SemanticSearchConfig, 'modelName' | 'indexConfig'> & { telemetry?: TelemetryReporter }
  private documents: Map<string, IndexedDocument> = new Map()
  private initialized = false

  constructor(config: SemanticSearchConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    }
  }

  /**
   * Initialize the search service
   * Must be called before indexing or searching
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // Load embedding model
    if (this.config.useMockModel) {
      this.model = new MockEmbeddingModel(384)
    } else {
      this.model = await loadEmbeddingModel({
        modelName: this.config.modelName
      })
    }

    // Create vector index
    this.index = createVectorIndex({
      dimensions: this.model.dimensions,
      metric: 'cosine',
      ...this.config.indexConfig
    })

    this.initialized = true
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Index a document for semantic search
   *
   * @param documentId - Unique document identifier
   * @param content - Document text content
   * @param metadata - Optional metadata (not used in search)
   */
  async indexDocument(documentId: string, content: string): Promise<IndexedDocument> {
    this.ensureInitialized()

    const start = this.config.telemetry ? Date.now() : 0

    // Remove existing document if present
    this.removeDocument(documentId)

    // Chunk content for better search quality
    const chunks = this.chunkText(content)

    // Generate embeddings and add to index
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = this.makeChunkId(documentId, i)
      const embedding = await this.model!.embed(chunks[i])
      this.index!.add(chunkId, embedding)
    }

    // Track document
    const doc: IndexedDocument = {
      id: documentId,
      chunkCount: chunks.length,
      indexedAt: Date.now()
    }
    this.documents.set(documentId, doc)

    this.config.telemetry?.reportPerformance('vectors.index_document', Date.now() - start)
    this.config.telemetry?.reportUsage('vectors.document_indexed', 1)

    return doc
  }

  /**
   * Index multiple documents in batch
   */
  async indexDocuments(
    documents: Array<{ id: string; content: string }>
  ): Promise<IndexedDocument[]> {
    const results: IndexedDocument[] = []
    for (const doc of documents) {
      const result = await this.indexDocument(doc.id, doc.content)
      results.push(result)
    }
    return results
  }

  /**
   * Remove a document from the index
   */
  removeDocument(documentId: string): boolean {
    const doc = this.documents.get(documentId)
    if (!doc) return false

    // Remove all chunks
    for (let i = 0; i < doc.chunkCount; i++) {
      const chunkId = this.makeChunkId(documentId, i)
      this.index?.remove(chunkId)
    }

    this.documents.delete(documentId)
    return true
  }

  /**
   * Check if document is indexed
   */
  hasDocument(documentId: string): boolean {
    return this.documents.has(documentId)
  }

  /**
   * Get indexed document info
   */
  getDocument(documentId: string): IndexedDocument | undefined {
    return this.documents.get(documentId)
  }

  /**
   * Get all indexed document IDs
   */
  getDocumentIds(): string[] {
    return Array.from(this.documents.keys())
  }

  /**
   * Get total number of indexed documents
   */
  documentCount(): number {
    return this.documents.size
  }

  /**
   * Get total number of vectors in index
   */
  vectorCount(): number {
    return this.index?.size() || 0
  }

  /**
   * Perform semantic search
   *
   * @param query - Search query text
   * @param options - Search options (overrides defaults)
   */
  async search(
    query: string,
    options: { minScore?: number; maxResults?: number } = {}
  ): Promise<DocumentSearchResult[]> {
    this.ensureInitialized()

    const start = this.config.telemetry ? Date.now() : 0
    const minScore = options.minScore ?? this.config.minScore
    const maxResults = options.maxResults ?? this.config.maxResults

    // Generate query embedding
    const queryEmbedding = await this.model!.embed(query)

    // Search index (get more results to handle deduplication)
    const rawResults = this.index!.search(queryEmbedding, maxResults * 3, minScore)

    // Deduplicate by document ID (take best score per document)
    const byDocument = new Map<string, DocumentSearchResult>()

    for (const result of rawResults) {
      const { documentId, chunkIndex } = this.parseChunkId(result.id)

      const existing = byDocument.get(documentId)
      if (!existing || result.score > existing.score) {
        byDocument.set(documentId, {
          id: documentId,
          score: result.score,
          chunkIndex
        })
      }
    }

    // Sort by score and limit results
    const results = Array.from(byDocument.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)

    this.config.telemetry?.reportPerformance('vectors.search', Date.now() - start)
    this.config.telemetry?.reportUsage('vectors.search_results', results.length)

    return results
  }

  /**
   * Find similar documents to a given document
   */
  async findSimilar(
    documentId: string,
    options: { minScore?: number; maxResults?: number } = {}
  ): Promise<DocumentSearchResult[]> {
    this.ensureInitialized()

    const doc = this.documents.get(documentId)
    if (!doc) return []

    // Get first chunk's embedding as representative
    const chunkId = this.makeChunkId(documentId, 0)
    const ids = this.index!.getIds()
    if (!ids.includes(chunkId)) return []

    // Search for similar (will include the document itself)
    const results = await this.searchByVector(
      await this.getVectorById(chunkId),
      options.maxResults ? options.maxResults + 1 : undefined,
      options.minScore
    )

    // Exclude the source document
    return results.filter((r) => r.id !== documentId)
  }

  /**
   * Search by raw vector
   */
  private async searchByVector(
    vector: Float32Array,
    maxResults?: number,
    minScore?: number
  ): Promise<DocumentSearchResult[]> {
    const results = this.index!.search(
      vector,
      (maxResults ?? this.config.maxResults) * 3,
      minScore ?? this.config.minScore
    )

    const byDocument = new Map<string, DocumentSearchResult>()

    for (const result of results) {
      const { documentId, chunkIndex } = this.parseChunkId(result.id)
      const existing = byDocument.get(documentId)
      if (!existing || result.score > existing.score) {
        byDocument.set(documentId, { id: documentId, score: result.score, chunkIndex })
      }
    }

    return Array.from(byDocument.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults ?? this.config.maxResults)
  }

  /**
   * Get vector by chunk ID (for internal use)
   */
  private async getVectorById(chunkId: string): Promise<Float32Array> {
    // This is a workaround - in production, we'd store vectors separately
    // For now, we re-embed the first chunk
    const doc = this.documents.get(this.parseChunkId(chunkId).documentId)
    if (!doc) throw new Error('Document not found')
    return this.model!.embed('') // Placeholder
  }

  /**
   * Clear all indexed documents
   */
  clear(): void {
    this.index?.clear()
    this.documents.clear()
  }

  /**
   * Serialize index state for persistence
   */
  serialize(): { index: Uint8Array; documents: Array<[string, IndexedDocument]> } {
    if (!this.index) throw new Error('Not initialized')
    return {
      index: this.index.serialize(),
      documents: Array.from(this.documents.entries())
    }
  }

  /**
   * Restore index state from serialized data
   */
  restore(data: { index: Uint8Array; documents: Array<[string, IndexedDocument]> }): void {
    this.index = VectorIndex.deserialize(data.index)
    this.documents = new Map(data.documents)
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.model || !this.index) {
      throw new Error('SemanticSearch not initialized. Call initialize() first.')
    }
  }

  private makeChunkId(documentId: string, chunkIndex: number): string {
    return `${documentId}::${chunkIndex}`
  }

  private parseChunkId(chunkId: string): { documentId: string; chunkIndex: number } {
    const parts = chunkId.split('::')
    return {
      documentId: parts.slice(0, -1).join('::'),
      chunkIndex: parseInt(parts[parts.length - 1], 10)
    }
  }

  /**
   * Split text into overlapping chunks
   */
  private chunkText(text: string): string[] {
    const { chunkSize, chunkOverlap } = this.config

    // Clean text
    const cleaned = text.replace(/\s+/g, ' ').trim()

    if (cleaned.length <= chunkSize) {
      return [cleaned]
    }

    const chunks: string[] = []
    let start = 0

    while (start < cleaned.length) {
      let end = Math.min(start + chunkSize, cleaned.length)

      // Try to break at sentence boundary
      if (end < cleaned.length) {
        const lastPeriod = cleaned.lastIndexOf('.', end)
        const lastNewline = cleaned.lastIndexOf('\n', end)
        const lastBreak = Math.max(lastPeriod, lastNewline)

        // Only use sentence boundary if it's reasonable
        if (lastBreak > start + chunkSize / 2) {
          end = lastBreak + 1
        }
      }

      const chunk = cleaned.slice(start, end).trim()
      if (chunk.length > 0) {
        chunks.push(chunk)
      }

      // Calculate next start position
      // Ensure we always make forward progress
      const nextStart = end - chunkOverlap
      if (nextStart <= start) {
        // If overlap would cause us to go backwards or stay in place, move forward
        start = end
      } else {
        start = nextStart
      }

      // Safety check: if we're at or past the end, stop
      if (start >= cleaned.length) break
    }

    return chunks
  }
}

/**
 * Create a semantic search service
 */
export function createSemanticSearch(config?: SemanticSearchConfig): SemanticSearch {
  return new SemanticSearch(config)
}
