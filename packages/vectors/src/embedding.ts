/**
 * Embedding Model - Text to vector conversion
 *
 * Uses @xenova/transformers for browser/node compatible embeddings.
 * Default model: sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)
 *
 * IMPORTANT: This module uses dynamic imports for @xenova/transformers
 * to avoid loading the heavy ML library unless actually needed.
 * Tests using MockEmbeddingModel don't trigger the import.
 */

// Cached transformers module (loaded lazily)
let transformersModule: any = null

async function getTransformers(): Promise<{ pipeline: any }> {
  if (!transformersModule) {
    // Dynamic import - only loaded when loadEmbeddingModel() is called
    transformersModule = await import('@xenova/transformers')
  }
  return transformersModule
}

/**
 * Embedding model interface
 */
export interface EmbeddingModel {
  /** Generate embedding for a single text */
  embed(text: string): Promise<Float32Array>
  /** Generate embeddings for multiple texts (more efficient) */
  embedBatch(texts: string[]): Promise<Float32Array[]>
  /** Number of dimensions in the embedding */
  dimensions: number
  /** Model name */
  modelName: string
}

/**
 * Configuration for embedding model
 */
export interface EmbeddingModelConfig {
  /** Model name from Hugging Face (default: Xenova/all-MiniLM-L6-v2) */
  modelName?: string
  /** Maximum sequence length (default: 256) */
  maxLength?: number
  /** Use quantized model for smaller size (default: true) */
  quantized?: boolean
  /** Progress callback for model loading */
  onProgress?: (progress: number) => void
}

/**
 * Default model configuration
 */
const DEFAULT_CONFIG: Required<Omit<EmbeddingModelConfig, 'onProgress'>> = {
  modelName: 'Xenova/all-MiniLM-L6-v2',
  maxLength: 256,
  quantized: true
}

/**
 * Model dimensions by model name
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  'Xenova/all-MiniLM-L6-v2': 384,
  'Xenova/all-MiniLM-L12-v2': 384,
  'Xenova/paraphrase-MiniLM-L6-v2': 384,
  'Xenova/gte-small': 384,
  'Xenova/gte-base': 768,
  'Xenova/bge-small-en-v1.5': 384,
  'Xenova/bge-base-en-v1.5': 768
}

/**
 * Loaded embedding model instance
 */
class TransformersEmbeddingModel implements EmbeddingModel {
  // Use 'any' to avoid importing transformers types at module level
  private extractor: any
  readonly dimensions: number
  readonly modelName: string
  private maxLength: number

  constructor(extractor: any, modelName: string, dimensions: number, maxLength: number) {
    this.extractor = extractor
    this.modelName = modelName
    this.dimensions = dimensions
    this.maxLength = maxLength
  }

  async embed(text: string): Promise<Float32Array> {
    const result = await this.extractor(text, {
      pooling: 'mean',
      normalize: true
    })

    // Result is a nested array, extract the embedding
    const data = result.data as Float32Array
    return new Float32Array(data)
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return []

    // Process in batches to avoid memory issues
    const batchSize = 32
    const results: Float32Array[] = []

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)

      // Process each text individually (transformers.js batch support varies)
      const batchResults = await Promise.all(batch.map((text) => this.embed(text)))
      results.push(...batchResults)
    }

    return results
  }
}

/**
 * Load an embedding model
 *
 * @example
 * ```typescript
 * const model = await loadEmbeddingModel()
 * const embedding = await model.embed("Hello world")
 * console.log(embedding.length) // 384
 * ```
 */
export async function loadEmbeddingModel(
  config: EmbeddingModelConfig = {}
): Promise<EmbeddingModel> {
  const { modelName, maxLength, quantized } = { ...DEFAULT_CONFIG, ...config }

  // Get dimensions for model
  const dimensions = MODEL_DIMENSIONS[modelName] || 384

  // Dynamically load transformers.js only when needed
  const { pipeline } = await getTransformers()

  // Load the model
  const extractor = await pipeline('feature-extraction', modelName, {
    quantized,
    progress_callback: config.onProgress
      ? (progress: { status: string; progress?: number }) => {
          if (progress.progress !== undefined) {
            config.onProgress!(progress.progress / 100)
          }
        }
      : undefined
  })

  return new TransformersEmbeddingModel(extractor, modelName, dimensions, maxLength)
}

/**
 * Simple embedding model that uses random vectors
 * Useful for testing without loading a real model
 */
export class MockEmbeddingModel implements EmbeddingModel {
  readonly dimensions: number
  readonly modelName = 'mock'
  private seed: number

  constructor(dimensions = 384, seed = 42) {
    this.dimensions = dimensions
    this.seed = seed
  }

  async embed(text: string): Promise<Float32Array> {
    // Generate deterministic pseudo-random embedding based on text
    const embedding = new Float32Array(this.dimensions)
    let hash = this.hashCode(text)

    for (let i = 0; i < this.dimensions; i++) {
      hash = this.nextRandom(hash)
      embedding[i] = (hash / 2147483647) * 2 - 1 // Range [-1, 1]
    }

    // Normalize to unit length
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
    for (let i = 0; i < this.dimensions; i++) {
      embedding[i] /= norm
    }

    return embedding
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((text) => this.embed(text)))
  }

  private hashCode(str: string): number {
    let hash = this.seed
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash + char) | 0
    }
    return hash
  }

  private nextRandom(seed: number): number {
    // LCG random number generator
    return (seed * 1103515245 + 12345) & 0x7fffffff
  }
}

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  if (magnitude === 0) return 0

  return dotProduct / magnitude
}

/**
 * Compute Euclidean distance between two vectors
 */
export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }

  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }

  return Math.sqrt(sum)
}
