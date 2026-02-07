/**
 * @xnet/data - LRU row cache for hybrid queries.
 *
 * Caches recently fetched rows to avoid re-fetching from the hub.
 * Uses LRU (Least Recently Used) eviction policy.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * A cached database row.
 */
export type CachedRow<T = Record<string, unknown>> = {
  id: string
  databaseId: string
  sortKey: string
  cells: T
  createdAt: number
  createdBy: string
}

/**
 * Internal cache entry with metadata.
 */
type CacheEntry<T> = {
  row: CachedRow<T>
  fetchedAt: number
}

/**
 * Configuration for the row cache.
 */
export type RowCacheConfig = {
  /** Maximum number of rows to cache (default: 10,000) */
  maxSize: number

  /** Maximum age of cached rows in ms (default: 5 minutes) */
  maxAge: number
}

/**
 * Cache statistics.
 */
export type CacheStats = {
  size: number
  hits: number
  misses: number
  evictions: number
}

// ─── Default Config ────────────────────────────────────────────────────────────

export const DEFAULT_CACHE_CONFIG: RowCacheConfig = {
  maxSize: 10_000,
  maxAge: 5 * 60 * 1000 // 5 minutes
}

// ─── Row Cache ─────────────────────────────────────────────────────────────────

/**
 * LRU cache for database rows.
 *
 * Features:
 * - LRU eviction when at capacity
 * - TTL-based expiration
 * - Per-database invalidation
 * - Cache statistics
 */
export class RowCache<T = Record<string, unknown>> {
  private cache = new Map<string, CacheEntry<T>>()
  private config: RowCacheConfig
  private stats = { hits: 0, misses: 0, evictions: 0 }

  constructor(config: Partial<RowCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config }
  }

  /**
   * Get a row from the cache.
   * Returns undefined if not found or expired.
   */
  get(id: string): CachedRow<T> | undefined {
    const entry = this.cache.get(id)

    if (!entry) {
      this.stats.misses++
      return undefined
    }

    // Check if expired
    if (Date.now() - entry.fetchedAt > this.config.maxAge) {
      this.cache.delete(id)
      this.stats.misses++
      return undefined
    }

    // Move to end (LRU: most recently used)
    this.cache.delete(id)
    this.cache.set(id, entry)

    this.stats.hits++
    return entry.row
  }

  /**
   * Get multiple rows from the cache.
   * Returns only the rows that are found and not expired.
   */
  getMany(ids: string[]): Map<string, CachedRow<T>> {
    const result = new Map<string, CachedRow<T>>()

    for (const id of ids) {
      const row = this.get(id)
      if (row) {
        result.set(id, row)
      }
    }

    return result
  }

  /**
   * Add a row to the cache.
   */
  set(id: string, row: CachedRow<T>): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.config.maxSize && !this.cache.has(id)) {
      const oldest = this.cache.keys().next().value
      if (oldest) {
        this.cache.delete(oldest)
        this.stats.evictions++
      }
    }

    this.cache.set(id, {
      row,
      fetchedAt: Date.now()
    })
  }

  /**
   * Add multiple rows to the cache.
   */
  setMany(rows: CachedRow<T>[]): void {
    for (const row of rows) {
      this.set(row.id, row)
    }
  }

  /**
   * Check if a row is in the cache (and not expired).
   */
  has(id: string): boolean {
    const entry = this.cache.get(id)
    if (!entry) return false

    if (Date.now() - entry.fetchedAt > this.config.maxAge) {
      this.cache.delete(id)
      return false
    }

    return true
  }

  /**
   * Invalidate a single row.
   */
  invalidate(id: string): void {
    this.cache.delete(id)
  }

  /**
   * Invalidate multiple rows.
   */
  invalidateMany(ids: string[]): void {
    for (const id of ids) {
      this.cache.delete(id)
    }
  }

  /**
   * Invalidate all rows for a database.
   */
  invalidateDatabase(databaseId: string): void {
    for (const [id, entry] of this.cache) {
      if (entry.row.databaseId === databaseId) {
        this.cache.delete(id)
      }
    }
  }

  /**
   * Clear all cached rows.
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return {
      size: this.cache.size,
      ...this.stats
    }
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 }
  }

  /**
   * Get the current size of the cache.
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Get the hit rate (hits / total requests).
   */
  get hitRate(): number {
    const total = this.stats.hits + this.stats.misses
    return total === 0 ? 0 : this.stats.hits / total
  }

  /**
   * Prune expired entries.
   * Call periodically to free memory.
   */
  prune(): number {
    const now = Date.now()
    let pruned = 0

    for (const [id, entry] of this.cache) {
      if (now - entry.fetchedAt > this.config.maxAge) {
        this.cache.delete(id)
        pruned++
      }
    }

    return pruned
  }

  /**
   * Get all cached row IDs for a database.
   */
  getIdsForDatabase(databaseId: string): string[] {
    const ids: string[] = []

    for (const [id, entry] of this.cache) {
      if (entry.row.databaseId === databaseId) {
        ids.push(id)
      }
    }

    return ids
  }
}

// ─── Factory Function ──────────────────────────────────────────────────────────

/**
 * Create a row cache with optional configuration.
 */
export function createRowCache<T = Record<string, unknown>>(
  config?: Partial<RowCacheConfig>
): RowCache<T> {
  return new RowCache<T>(config)
}
