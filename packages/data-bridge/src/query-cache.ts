/**
 * QueryCache - In-memory cache for query results with LRU eviction
 *
 * Provides:
 * - Fast synchronous access to query results (for useSyncExternalStore)
 * - Subscriber notification on cache updates
 * - Query deduplication via stable query IDs
 * - LRU eviction for memory management
 * - Weak references for inactive subscriptions (automatic cleanup)
 */

import type { QueryOptions, SortDirection, SystemOrderField } from './types'
import type { NodeState, PropertyBuilder, InferCreateProps, SchemaIRI } from '@xnet/data'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Default maximum number of queries to cache */
const DEFAULT_MAX_SIZE = 100

/** Minimum time (ms) before an entry can be evicted */
const MIN_AGE_FOR_EVICTION = 30_000 // 30 seconds

/** Interval (ms) for checking and cleaning up dead weak references */
const WEAK_REF_CLEANUP_INTERVAL = 60_000 // 60 seconds

interface CacheEntry {
  /** Cached query result */
  data: NodeState[] | null
  /** Strong subscribers to this query (active subscriptions) */
  subscribers: Set<() => void>
  /** Weak subscribers (for long-lived but GC-able subscriptions) */
  weakSubscribers: Map<() => void, WeakRef<() => void>>
  /** Schema IRI for this query */
  schemaId: SchemaIRI
  /** Query options */
  options: QueryOptions
  /** Last update timestamp */
  lastUpdated: number
  /** Last access timestamp (for LRU) */
  lastAccessed: number
}

export interface QueryCacheOptions {
  /** Maximum number of queries to cache (default: 100) */
  maxSize?: number
  /** Enable weak reference cleanup interval (default: true in browser, false in tests) */
  enableWeakRefCleanup?: boolean
}

// ─── QueryCache Class ────────────────────────────────────────────────────────

/**
 * In-memory cache for query results with subscriber notification and LRU eviction.
 */
export class QueryCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize: number
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor(options?: QueryCacheOptions) {
    this.maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE

    // Start weak reference cleanup interval (only in browser environment)
    const enableCleanup = options?.enableWeakRefCleanup ?? typeof window !== 'undefined'
    if (enableCleanup) {
      this.startWeakRefCleanup()
    }
  }

  /**
   * Start the interval that cleans up dead weak references.
   */
  private startWeakRefCleanup(): void {
    if (this.cleanupInterval) return

    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadWeakRefs()
    }, WEAK_REF_CLEANUP_INTERVAL)

    // Don't prevent process from exiting in Node.js
    if (typeof this.cleanupInterval === 'object' && 'unref' in this.cleanupInterval) {
      this.cleanupInterval.unref()
    }
  }

  /**
   * Stop the weak reference cleanup interval.
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Clean up dead weak references from all cache entries.
   * Returns the number of dead references removed.
   */
  cleanupDeadWeakRefs(): number {
    let removed = 0

    for (const entry of this.cache.values()) {
      for (const [identity, ref] of entry.weakSubscribers) {
        if (ref.deref() === undefined) {
          entry.weakSubscribers.delete(identity)
          removed++
        }
      }
    }

    return removed
  }

  /**
   * Compute a stable query ID from schema and options.
   * Same query params should produce the same ID for deduplication.
   */
  computeQueryId<P extends Record<string, PropertyBuilder>>(
    schemaId: string,
    options?: QueryOptions<P>
  ): string {
    const parts = [schemaId]

    if (options?.nodeId) {
      parts.push(`id:${options.nodeId}`)
    }

    if (options?.where) {
      // Sort keys for stable ordering
      const sortedWhere = Object.keys(options.where)
        .sort()
        .map((k) => `${k}:${JSON.stringify(options.where![k as keyof typeof options.where])}`)
        .join(',')
      parts.push(`where:{${sortedWhere}}`)
    }

    if (options?.includeDeleted) {
      parts.push('deleted:true')
    }

    if (options?.orderBy) {
      const sortedOrder = Object.entries(options.orderBy)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join(',')
      parts.push(`order:{${sortedOrder}}`)
    }

    if (options?.limit !== undefined) {
      parts.push(`limit:${options.limit}`)
    }

    if (options?.offset !== undefined) {
      parts.push(`offset:${options.offset}`)
    }

    return parts.join('|')
  }

  /**
   * Get cached data for a query (synchronous for useSyncExternalStore).
   * Updates lastAccessed for LRU tracking.
   */
  get(queryId: string): NodeState[] | null {
    const entry = this.cache.get(queryId)
    if (entry) {
      entry.lastAccessed = Date.now()
    }
    return entry?.data ?? null
  }

  /**
   * Check if a query is in the cache.
   */
  has(queryId: string): boolean {
    return this.cache.has(queryId)
  }

  /**
   * Set cached data for a query and notify subscribers.
   * Triggers LRU eviction if cache exceeds maxSize.
   */
  set(queryId: string, data: NodeState[], schemaId: SchemaIRI, options: QueryOptions): void {
    const entry = this.cache.get(queryId)
    const now = Date.now()

    if (entry) {
      entry.data = data
      entry.lastUpdated = now
      entry.lastAccessed = now
      this.notifySubscribers(queryId)
    } else {
      // Evict before adding if at capacity
      this.evictIfNeeded()

      this.cache.set(queryId, {
        data,
        subscribers: new Set(),
        weakSubscribers: new Map(),
        schemaId,
        options,
        lastUpdated: now,
        lastAccessed: now
      })
    }
  }

  /**
   * Initialize a cache entry (called when starting a subscription).
   */
  initEntry(queryId: string, schemaId: SchemaIRI, options: QueryOptions): void {
    if (!this.cache.has(queryId)) {
      const now = Date.now()
      this.cache.set(queryId, {
        data: null,
        subscribers: new Set(),
        weakSubscribers: new Map(),
        schemaId,
        options,
        lastUpdated: 0,
        lastAccessed: now
      })
    }
  }

  /**
   * Subscribe to cache updates for a query.
   * Uses strong references - callback will not be garbage collected until unsubscribed.
   */
  subscribe(queryId: string, callback: () => void): () => void {
    const entry = this.cache.get(queryId)
    if (entry) {
      entry.subscribers.add(callback)
    }

    return () => {
      const e = this.cache.get(queryId)
      if (e) {
        e.subscribers.delete(callback)
      }
    }
  }

  /**
   * Subscribe with a weak reference.
   * The callback can be garbage collected if the owning component is unmounted
   * and no other references to the callback exist.
   *
   * This is useful for long-lived subscriptions where you want automatic cleanup
   * without explicit unsubscribe calls. However, for React components, prefer
   * the regular subscribe() with proper cleanup in useEffect.
   *
   * @param queryId - The query to subscribe to
   * @param callback - The callback to invoke on updates
   * @returns Unsubscribe function
   */
  subscribeWeak(queryId: string, callback: () => void): () => void {
    const entry = this.cache.get(queryId)
    if (entry) {
      entry.weakSubscribers.set(callback, new WeakRef(callback))
    }

    return () => {
      const e = this.cache.get(queryId)
      if (e) {
        e.weakSubscribers.delete(callback)
      }
    }
  }

  /**
   * Notify all subscribers of a query that data has changed.
   * Handles both strong and weak subscribers, cleaning up dead weak refs.
   */
  notifySubscribers(queryId: string): void {
    const entry = this.cache.get(queryId)
    if (!entry) return

    // Notify strong subscribers
    for (const callback of entry.subscribers) {
      callback()
    }

    // Notify weak subscribers (and clean up dead ones)
    for (const [identity, ref] of entry.weakSubscribers) {
      const callback = ref.deref()
      if (callback) {
        callback()
      } else {
        // Callback was garbage collected, remove the entry
        entry.weakSubscribers.delete(identity)
      }
    }
  }

  /**
   * Get the number of active subscribers for a query.
   * Includes both strong and live weak subscribers.
   */
  getSubscriberCount(queryId: string): number {
    const entry = this.cache.get(queryId)
    if (!entry) return 0

    // Count strong subscribers
    let count = entry.subscribers.size

    // Count live weak subscribers
    for (const ref of entry.weakSubscribers.values()) {
      if (ref.deref() !== undefined) {
        count++
      }
    }

    return count
  }

  /**
   * Get the number of weak subscribers (including potentially dead ones).
   * Useful for debugging.
   */
  getWeakSubscriberCount(queryId: string): number {
    return this.cache.get(queryId)?.weakSubscribers.size ?? 0
  }

  /**
   * Remove a query from the cache.
   */
  delete(queryId: string): void {
    this.cache.delete(queryId)
  }

  /**
   * Get all query IDs that match a schema.
   */
  getQueriesForSchema(schemaId: SchemaIRI): string[] {
    const matches: string[] = []
    for (const [queryId, entry] of this.cache) {
      if (entry.schemaId === schemaId) {
        matches.push(queryId)
      }
    }
    return matches
  }

  /**
   * Get the schema IRI for a cached query.
   */
  getSchemaId(queryId: string): SchemaIRI | undefined {
    return this.cache.get(queryId)?.schemaId
  }

  /**
   * Get the options for a cached query.
   */
  getOptions(queryId: string): QueryOptions | undefined {
    return this.cache.get(queryId)?.options
  }

  /**
   * Clear the entire cache and stop cleanup interval.
   */
  clear(): void {
    this.stopCleanup()
    this.cache.clear()
  }

  /**
   * Destroy the cache, stopping all cleanup intervals.
   */
  destroy(): void {
    this.stopCleanup()
    this.cache.clear()
  }

  /**
   * Get the number of cached queries.
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Get the maximum cache size.
   */
  get maxCacheSize(): number {
    return this.maxSize
  }

  // ─── LRU Eviction ──────────────────────────────────────────────────────────

  /**
   * Check if an entry has any active subscribers (strong or live weak).
   */
  private hasActiveSubscribers(entry: CacheEntry): boolean {
    if (entry.subscribers.size > 0) return true

    // Check if any weak subscribers are still alive
    for (const ref of entry.weakSubscribers.values()) {
      if (ref.deref() !== undefined) return true
    }

    return false
  }

  /**
   * Evict least-recently-used entries if cache exceeds maxSize.
   * Only evicts entries with no active subscribers and older than MIN_AGE_FOR_EVICTION.
   */
  private evictIfNeeded(): void {
    if (this.cache.size < this.maxSize) return

    const now = Date.now()
    const candidates: Array<{ queryId: string; lastAccessed: number }> = []

    // Find eviction candidates: entries with no subscribers and old enough
    for (const [queryId, entry] of this.cache) {
      if (!this.hasActiveSubscribers(entry) && now - entry.lastAccessed > MIN_AGE_FOR_EVICTION) {
        candidates.push({ queryId, lastAccessed: entry.lastAccessed })
      }
    }

    if (candidates.length === 0) return

    // Sort by lastAccessed (oldest first)
    candidates.sort((a, b) => a.lastAccessed - b.lastAccessed)

    // Evict enough entries to get below 80% of maxSize
    const targetSize = Math.floor(this.maxSize * 0.8)
    const toEvict = this.cache.size - targetSize

    for (let i = 0; i < Math.min(toEvict, candidates.length); i++) {
      this.cache.delete(candidates[i].queryId)
    }
  }

  /**
   * Manually trigger eviction (for testing or explicit cleanup).
   */
  evict(): number {
    const sizeBefore = this.cache.size
    this.evictIfNeeded()
    return sizeBefore - this.cache.size
  }

  // ─── Helpers for filtering and sorting ─────────────────────────────────────

  /**
   * Filter nodes based on query options.
   */
  filterNodes<P extends Record<string, PropertyBuilder>>(
    nodes: NodeState[],
    options?: QueryOptions<P>
  ): NodeState[] {
    if (!options) return nodes

    let result = nodes

    // Filter by where clause
    if (options.where) {
      result = result.filter((node) => {
        for (const [key, value] of Object.entries(options.where!)) {
          if (node.properties[key] !== value) {
            return false
          }
        }
        return true
      })
    }

    // Filter deleted nodes
    if (!options.includeDeleted) {
      result = result.filter((node) => !node.deleted)
    }

    return result
  }

  /**
   * Sort nodes based on query options.
   */
  sortNodes<P extends Record<string, PropertyBuilder>>(
    nodes: NodeState[],
    options?: QueryOptions<P>
  ): NodeState[] {
    if (!options?.orderBy) return nodes

    const entries = Object.entries(options.orderBy) as [
      keyof InferCreateProps<P> | SystemOrderField,
      SortDirection
    ][]
    if (entries.length === 0) return nodes

    return [...nodes].sort((a, b) => {
      for (const [key, direction] of entries) {
        const keyStr = key as string
        // Check system fields first
        let aVal: unknown
        let bVal: unknown

        if (keyStr === 'createdAt' || keyStr === 'updatedAt') {
          aVal = a[keyStr]
          bVal = b[keyStr]
        } else {
          aVal = a.properties[keyStr]
          bVal = b.properties[keyStr]
        }

        if (aVal === bVal) continue

        // Handle null/undefined
        if (aVal == null) return direction === 'asc' ? 1 : -1
        if (bVal == null) return direction === 'asc' ? -1 : 1

        // Compare
        const comparison = aVal < bVal ? -1 : 1
        return direction === 'asc' ? comparison : -comparison
      }
      return 0
    })
  }

  /**
   * Apply pagination to nodes.
   */
  paginateNodes(nodes: NodeState[], options?: QueryOptions): NodeState[] {
    if (!options) return nodes

    let result = nodes

    if (options.offset !== undefined && options.offset > 0) {
      result = result.slice(options.offset)
    }

    if (options.limit !== undefined && options.limit > 0) {
      result = result.slice(0, options.limit)
    }

    return result
  }
}
