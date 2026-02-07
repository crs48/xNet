/**
 * Computed value cache for rollups and formulas.
 *
 * Provides efficient caching with LRU eviction, TTL expiration,
 * and dependency-based invalidation.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A cached computed value entry.
 */
export interface ComputedCacheEntry {
  /** The computed value */
  value: unknown

  /** When the value was computed (timestamp) */
  computedAt: number

  /** Hash of inputs used to compute (for validation) */
  inputHash: string

  /** Row IDs this value depends on */
  dependencies: string[]
}

/**
 * Configuration for the computed cache.
 */
export interface ComputedCacheConfig {
  /** Maximum entries in memory cache */
  maxSize: number

  /** Maximum age before recompute (ms) */
  maxAge: number
}

/**
 * Cache statistics.
 */
export interface ComputedCacheStats {
  /** Number of entries in cache */
  size: number

  /** Number of cache hits */
  hits: number

  /** Number of cache misses */
  misses: number

  /** Hit rate (0-1) */
  hitRate: number

  /** Number of evictions */
  evictions: number

  /** Number of invalidations */
  invalidations: number
}

/**
 * Default cache configuration.
 */
export const DEFAULT_COMPUTED_CACHE_CONFIG: ComputedCacheConfig = {
  maxSize: 10_000,
  maxAge: 5 * 60 * 1000 // 5 minutes
}

// ─── Computed Cache ──────────────────────────────────────────────────────────

/**
 * In-memory cache for computed column values.
 *
 * Features:
 * - LRU eviction when at capacity
 * - TTL-based expiration
 * - Dependency-based invalidation
 * - Cache statistics
 *
 * @example
 * ```typescript
 * const cache = new ComputedCache()
 *
 * // Store a computed value
 * cache.set('row-1', 'total', {
 *   value: 100,
 *   computedAt: Date.now(),
 *   inputHash: 'abc123',
 *   dependencies: ['row-2', 'row-3']
 * })
 *
 * // Retrieve
 * const entry = cache.get('row-1', 'total')
 *
 * // Invalidate when a dependency changes
 * cache.invalidate('row-2')
 * ```
 */
export class ComputedCache {
  private memory = new Map<string, ComputedCacheEntry>()
  private dependencyIndex = new Map<string, Set<string>>() // rowId -> cacheKeys
  private accessOrder: string[] = [] // For LRU eviction

  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0
  }

  constructor(private config: ComputedCacheConfig = DEFAULT_COMPUTED_CACHE_CONFIG) {}

  /**
   * Get a cached computed value.
   * Returns null if not found or expired.
   */
  get(rowId: string, columnId: string): ComputedCacheEntry | null {
    const key = this.cacheKey(rowId, columnId)
    const entry = this.memory.get(key)

    if (!entry) {
      this.stats.misses++
      return null
    }

    if (this.isExpired(entry)) {
      this.memory.delete(key)
      this.removeFromAccessOrder(key)
      this.stats.misses++
      return null
    }

    // Update access order for LRU
    this.updateAccessOrder(key)
    this.stats.hits++

    return entry
  }

  /**
   * Store a computed value.
   */
  set(rowId: string, columnId: string, entry: ComputedCacheEntry): void {
    const key = this.cacheKey(rowId, columnId)

    // Evict if at capacity
    while (this.memory.size >= this.config.maxSize) {
      this.evictOldest()
    }

    // Store in memory
    this.memory.set(key, entry)
    this.updateAccessOrder(key)

    // Index dependencies
    for (const depRowId of entry.dependencies) {
      if (!this.dependencyIndex.has(depRowId)) {
        this.dependencyIndex.set(depRowId, new Set())
      }
      this.dependencyIndex.get(depRowId)!.add(key)
    }
  }

  /**
   * Check if a value exists and is valid.
   */
  has(rowId: string, columnId: string): boolean {
    const entry = this.get(rowId, columnId)
    return entry !== null
  }

  /**
   * Invalidate all computed values that depend on a row.
   */
  invalidate(rowId: string): void {
    // Get all cache keys that depend on this row
    const dependentKeys = this.dependencyIndex.get(rowId)

    if (dependentKeys) {
      for (const key of dependentKeys) {
        this.memory.delete(key)
        this.removeFromAccessOrder(key)
        this.stats.invalidations++
      }
      this.dependencyIndex.delete(rowId)
    }

    // Also invalidate the row's own computed values
    for (const key of this.memory.keys()) {
      if (key.startsWith(`${rowId}:`)) {
        this.memory.delete(key)
        this.removeFromAccessOrder(key)
        this.stats.invalidations++
      }
    }
  }

  /**
   * Invalidate a specific computed value.
   */
  invalidateCell(rowId: string, columnId: string): void {
    const key = this.cacheKey(rowId, columnId)
    if (this.memory.has(key)) {
      this.memory.delete(key)
      this.removeFromAccessOrder(key)
      this.stats.invalidations++
    }
  }

  /**
   * Invalidate all computed values for a database.
   */
  invalidateDatabase(_databaseId: string): void {
    // Clear all entries that belong to this database
    // Since we don't track database ID in the cache key,
    // we need to clear everything (or add database tracking)
    this.clear()
  }

  /**
   * Clear all cached values.
   */
  clear(): void {
    const count = this.memory.size
    this.memory.clear()
    this.dependencyIndex.clear()
    this.accessOrder = []
    this.stats.invalidations += count
  }

  /**
   * Get cache statistics.
   */
  getStats(): ComputedCacheStats {
    const total = this.stats.hits + this.stats.misses
    return {
      size: this.memory.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictions: this.stats.evictions,
      invalidations: this.stats.invalidations
    }
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0
    }
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  private cacheKey(rowId: string, columnId: string): string {
    return `${rowId}:${columnId}`
  }

  private isExpired(entry: ComputedCacheEntry): boolean {
    return Date.now() - entry.computedAt > this.config.maxAge
  }

  private evictOldest(): void {
    if (this.accessOrder.length === 0) return

    const oldest = this.accessOrder.shift()!
    this.memory.delete(oldest)
    this.stats.evictions++

    // Clean up dependency index
    for (const keys of this.dependencyIndex.values()) {
      keys.delete(oldest)
    }
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key)
    this.accessOrder.push(key)
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index !== -1) {
      this.accessOrder.splice(index, 1)
    }
  }
}

/**
 * Create a new ComputedCache instance.
 */
export function createComputedCache(config?: Partial<ComputedCacheConfig>): ComputedCache {
  return new ComputedCache({
    ...DEFAULT_COMPUTED_CACHE_CONFIG,
    ...config
  })
}

// ─── Batch Invalidation ──────────────────────────────────────────────────────

/**
 * Batch invalidate for bulk operations.
 */
export function batchInvalidate(cache: ComputedCache, rowIds: string[]): void {
  for (const rowId of rowIds) {
    cache.invalidate(rowId)
  }
}

// ─── Hash Utilities ──────────────────────────────────────────────────────────

/**
 * Compute a hash for input values.
 * Used to detect when cached values are stale.
 */
export function computeInputHash(values: Record<string, unknown>): string {
  return JSON.stringify(values)
}

/**
 * Check if a cached entry is still valid based on current inputs.
 */
export function isEntryValid(
  entry: ComputedCacheEntry,
  currentInputs: Record<string, unknown>
): boolean {
  const currentHash = computeInputHash(currentInputs)
  return entry.inputHash === currentHash
}
