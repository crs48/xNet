/**
 * QueryCache - In-memory cache for query results
 *
 * Provides:
 * - Fast synchronous access to query results (for useSyncExternalStore)
 * - Subscriber notification on cache updates
 * - Query deduplication via stable query IDs
 */

import type { QueryOptions, SortDirection, SystemOrderField } from './types'
import type { NodeState, PropertyBuilder, InferCreateProps, SchemaIRI } from '@xnet/data'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CacheEntry {
  /** Cached query result */
  data: NodeState[] | null
  /** Subscribers to this query */
  subscribers: Set<() => void>
  /** Schema IRI for this query */
  schemaId: SchemaIRI
  /** Query options */
  options: QueryOptions
  /** Last update timestamp */
  lastUpdated: number
}

// ─── QueryCache Class ────────────────────────────────────────────────────────

/**
 * In-memory cache for query results with subscriber notification.
 */
export class QueryCache {
  private cache = new Map<string, CacheEntry>()

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
   */
  get(queryId: string): NodeState[] | null {
    return this.cache.get(queryId)?.data ?? null
  }

  /**
   * Check if a query is in the cache.
   */
  has(queryId: string): boolean {
    return this.cache.has(queryId)
  }

  /**
   * Set cached data for a query and notify subscribers.
   */
  set(queryId: string, data: NodeState[], schemaId: SchemaIRI, options: QueryOptions): void {
    const entry = this.cache.get(queryId)

    if (entry) {
      entry.data = data
      entry.lastUpdated = Date.now()
      this.notifySubscribers(queryId)
    } else {
      this.cache.set(queryId, {
        data,
        subscribers: new Set(),
        schemaId,
        options,
        lastUpdated: Date.now()
      })
    }
  }

  /**
   * Initialize a cache entry (called when starting a subscription).
   */
  initEntry(queryId: string, schemaId: SchemaIRI, options: QueryOptions): void {
    if (!this.cache.has(queryId)) {
      this.cache.set(queryId, {
        data: null,
        subscribers: new Set(),
        schemaId,
        options,
        lastUpdated: 0
      })
    }
  }

  /**
   * Subscribe to cache updates for a query.
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
   * Notify all subscribers of a query that data has changed.
   */
  notifySubscribers(queryId: string): void {
    const entry = this.cache.get(queryId)
    if (entry) {
      for (const callback of entry.subscribers) {
        callback()
      }
    }
  }

  /**
   * Get the number of active subscribers for a query.
   */
  getSubscriberCount(queryId: string): number {
    return this.cache.get(queryId)?.subscribers.size ?? 0
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
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get the number of cached queries.
   */
  get size(): number {
    return this.cache.size
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
