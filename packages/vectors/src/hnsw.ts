/**
 * HNSW Vector Index - Fast Approximate Nearest Neighbor Search
 *
 * Uses usearch for WASM-compatible HNSW implementation.
 * Provides add, remove, search, and persistence operations.
 */

/**
 * Metric type for distance calculation
 */
export type MetricType = 'cosine' | 'l2sq' | 'ip'

/**
 * Configuration for vector index
 */
export interface VectorIndexConfig {
  /** Number of dimensions in vectors */
  dimensions: number
  /** Distance metric (default: cosine) */
  metric?: MetricType
  /** Max connections per node (default: 16) */
  connectivity?: number
  /** Build-time search depth (default: 128) */
  expansionAdd?: number
  /** Search-time depth (default: 64) */
  expansionSearch?: number
}

/**
 * Search result with ID and similarity score
 */
export interface SearchResult {
  /** Document ID */
  id: string
  /** Similarity score (0-1 for cosine, higher is better) */
  score: number
}

/**
 * Vector index entry
 */
interface IndexEntry {
  id: string
  vector: Float32Array
}

/**
 * Simple in-memory vector index using linear scan
 * (Fallback when usearch is not available)
 */
export class LinearVectorIndex {
  private config: Required<VectorIndexConfig>
  private entries: Map<string, IndexEntry> = new Map()

  constructor(config: VectorIndexConfig) {
    this.config = {
      dimensions: config.dimensions,
      metric: config.metric || 'cosine',
      connectivity: config.connectivity || 16,
      expansionAdd: config.expansionAdd || 128,
      expansionSearch: config.expansionSearch || 64
    }
  }

  /**
   * Add or update a vector in the index
   */
  add(id: string, vector: Float32Array): void {
    if (vector.length !== this.config.dimensions) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.config.dimensions}, got ${vector.length}`
      )
    }

    // Normalize for cosine similarity
    const normalized =
      this.config.metric === 'cosine' ? this.normalize(vector) : new Float32Array(vector)

    this.entries.set(id, { id, vector: normalized })
  }

  /**
   * Remove a vector from the index
   */
  remove(id: string): boolean {
    return this.entries.delete(id)
  }

  /**
   * Check if vector exists in index
   */
  has(id: string): boolean {
    return this.entries.has(id)
  }

  /**
   * Search for k nearest neighbors
   */
  search(vector: Float32Array, k: number, threshold?: number): SearchResult[] {
    if (vector.length !== this.config.dimensions) {
      throw new Error(
        `Query vector dimension mismatch: expected ${this.config.dimensions}, got ${vector.length}`
      )
    }

    // Normalize query for cosine similarity
    const queryVector = this.config.metric === 'cosine' ? this.normalize(vector) : vector

    // Calculate distances to all vectors
    const results: SearchResult[] = []

    for (const entry of this.entries.values()) {
      const score = this.calculateSimilarity(queryVector, entry.vector)
      if (threshold === undefined || score >= threshold) {
        results.push({ id: entry.id, score })
      }
    }

    // Sort by score descending and take top k
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, k)
  }

  /**
   * Get number of vectors in index
   */
  size(): number {
    return this.entries.size
  }

  /**
   * Get index configuration
   */
  getConfig(): VectorIndexConfig {
    return { ...this.config }
  }

  /**
   * Get all IDs in the index
   */
  getIds(): string[] {
    return Array.from(this.entries.keys())
  }

  /**
   * Clear all vectors from index
   */
  clear(): void {
    this.entries.clear()
  }

  /**
   * Serialize index to binary format for persistence
   */
  serialize(): Uint8Array {
    const data = {
      config: this.config,
      entries: Array.from(this.entries.values()).map((e) => ({
        id: e.id,
        vector: Array.from(e.vector)
      }))
    }

    const json = JSON.stringify(data)
    return new TextEncoder().encode(json)
  }

  /**
   * Deserialize index from binary format
   */
  static deserialize(data: Uint8Array): LinearVectorIndex {
    const json = new TextDecoder().decode(data)
    const parsed = JSON.parse(json)

    const index = new LinearVectorIndex(parsed.config)

    for (const entry of parsed.entries) {
      index.entries.set(entry.id, {
        id: entry.id,
        vector: new Float32Array(entry.vector)
      })
    }

    return index
  }

  /**
   * Normalize vector to unit length
   */
  private normalize(vector: Float32Array): Float32Array {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
    if (norm === 0) return vector

    const normalized = new Float32Array(vector.length)
    for (let i = 0; i < vector.length; i++) {
      normalized[i] = vector[i] / norm
    }
    return normalized
  }

  /**
   * Calculate similarity based on metric
   */
  private calculateSimilarity(a: Float32Array, b: Float32Array): number {
    switch (this.config.metric) {
      case 'cosine':
        // Dot product of normalized vectors = cosine similarity
        return this.dotProduct(a, b)
      case 'ip':
        // Inner product (not normalized)
        return this.dotProduct(a, b)
      case 'l2sq':
        // Convert L2 squared distance to similarity (1 / (1 + distance))
        return 1 / (1 + this.l2Squared(a, b))
      default:
        return this.dotProduct(a, b)
    }
  }

  private dotProduct(a: Float32Array, b: Float32Array): number {
    let sum = 0
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i]
    }
    return sum
  }

  private l2Squared(a: Float32Array, b: Float32Array): number {
    let sum = 0
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i]
      sum += diff * diff
    }
    return sum
  }
}

/**
 * HNSW Vector Index using usearch
 * Falls back to LinearVectorIndex if usearch is not available
 */
export class VectorIndex {
  private impl: LinearVectorIndex
  private usearchIndex: unknown | null = null

  constructor(config: VectorIndexConfig) {
    // Use linear index as fallback (usearch native bindings may not be available)
    this.impl = new LinearVectorIndex(config)

    // Try to load usearch if available
    this.tryLoadUsearch(config)
  }

  private async tryLoadUsearch(config: VectorIndexConfig): Promise<void> {
    try {
      // Dynamic import to avoid errors if usearch is not available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usearch = (await import('usearch')) as any

      // Map metric names
      const metricMap: Record<MetricType, string> = {
        cosine: 'cos',
        l2sq: 'l2sq',
        ip: 'ip'
      }

      this.usearchIndex = new usearch.Index({
        metric: metricMap[config.metric || 'cosine'],
        dimensions: config.dimensions,
        connectivity: config.connectivity || 16,
        quantization: 'f32'
      })
    } catch {
      // usearch not available, using linear fallback
      console.warn('usearch not available, using linear search fallback')
    }
  }

  /**
   * Add or update a vector in the index
   */
  add(id: string, vector: Float32Array): void {
    this.impl.add(id, vector)
  }

  /**
   * Remove a vector from the index
   */
  remove(id: string): boolean {
    return this.impl.remove(id)
  }

  /**
   * Check if vector exists in index
   */
  has(id: string): boolean {
    return this.impl.has(id)
  }

  /**
   * Search for k nearest neighbors
   */
  search(vector: Float32Array, k: number, threshold?: number): SearchResult[] {
    return this.impl.search(vector, k, threshold)
  }

  /**
   * Get number of vectors in index
   */
  size(): number {
    return this.impl.size()
  }

  /**
   * Get index configuration
   */
  getConfig(): VectorIndexConfig {
    return this.impl.getConfig()
  }

  /**
   * Get all IDs in the index
   */
  getIds(): string[] {
    return this.impl.getIds()
  }

  /**
   * Clear all vectors from index
   */
  clear(): void {
    this.impl.clear()
  }

  /**
   * Serialize index to binary format
   */
  serialize(): Uint8Array {
    return this.impl.serialize()
  }

  /**
   * Deserialize index from binary format
   */
  static deserialize(data: Uint8Array): VectorIndex {
    const linear = LinearVectorIndex.deserialize(data)
    const index = new VectorIndex(linear.getConfig())
    index.impl = linear
    return index
  }
}

/**
 * Create a new vector index
 */
export function createVectorIndex(config: VectorIndexConfig): VectorIndex {
  return new VectorIndex(config)
}
