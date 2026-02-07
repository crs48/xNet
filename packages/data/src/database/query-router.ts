/**
 * @xnet/data - Query router for automatic local/hub query routing.
 *
 * Determines whether to execute queries locally (in-memory) or on the hub
 * server based on dataset size and query complexity.
 */

import type { FilterGroup } from './view-types'

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Query source: where the query will be executed.
 */
export type QuerySource = 'local' | 'hub' | 'hybrid'

/**
 * Configuration for the query router.
 */
export type QueryRouterConfig = {
  /** Max rows for local queries (default: 10,000) */
  localThreshold: number

  /** Max rows for hybrid queries (default: 100,000) */
  hybridThreshold: number

  /** Force hub for complex filters (default: true) */
  complexFilterToHub: boolean

  /** Force hub for full-text search (default: true) */
  searchToHub: boolean

  /** Max conditions before filter is considered complex (default: 5) */
  complexFilterThreshold: number
}

/**
 * Result of routing decision.
 */
export type QueryRouterResult = {
  source: QuerySource
  reason: string
}

/**
 * Options for routing decision.
 */
export type RouteOptions = {
  rowCount: number
  filters?: FilterGroup
  search?: string
  hasHubConnection: boolean
}

// ─── Default Config ────────────────────────────────────────────────────────────

export const DEFAULT_ROUTER_CONFIG: QueryRouterConfig = {
  localThreshold: 10_000,
  hybridThreshold: 100_000,
  complexFilterToHub: true,
  searchToHub: true,
  complexFilterThreshold: 5
}

// ─── Query Router ──────────────────────────────────────────────────────────────

/**
 * Query router that determines optimal query execution location.
 *
 * Routing logic:
 * 1. Full-text search always goes to hub (FTS5)
 * 2. Complex filters go to hub for SQL efficiency
 * 3. Small datasets (< 10K) stay local
 * 4. Medium datasets (10K-100K) use hybrid approach
 * 5. Large datasets (> 100K) go to hub
 * 6. Falls back to local if no hub connection
 */
export class QueryRouter {
  private config: QueryRouterConfig

  constructor(config: Partial<QueryRouterConfig> = {}) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config }
  }

  /**
   * Determine where to execute a query.
   */
  route(options: RouteOptions): QueryRouterResult {
    const { rowCount, filters, search, hasHubConnection } = options

    // Full-text search always goes to hub (FTS5)
    if (search && this.config.searchToHub) {
      if (!hasHubConnection) {
        return { source: 'local', reason: 'search_no_hub_fallback' }
      }
      return { source: 'hub', reason: 'search_requires_fts5' }
    }

    // Complex filters go to hub for SQL efficiency
    if (filters && this.isComplexFilter(filters) && this.config.complexFilterToHub) {
      if (!hasHubConnection) {
        return { source: 'local', reason: 'complex_filter_no_hub_fallback' }
      }
      return { source: 'hub', reason: 'complex_filter' }
    }

    // Route by row count
    if (rowCount < this.config.localThreshold) {
      return { source: 'local', reason: 'small_dataset' }
    }

    if (!hasHubConnection) {
      return { source: 'local', reason: 'no_hub_connection' }
    }

    if (rowCount < this.config.hybridThreshold) {
      return { source: 'hybrid', reason: 'medium_dataset' }
    }

    return { source: 'hub', reason: 'large_dataset' }
  }

  /**
   * Check if a filter is complex enough to warrant hub execution.
   *
   * A filter is considered complex if:
   * - It has more than N conditions (default: 5)
   * - It has nested groups
   */
  isComplexFilter(filter: FilterGroup): boolean {
    // Many conditions
    if (filter.conditions.length > this.config.complexFilterThreshold) {
      return true
    }

    // Check for nested groups
    for (const condition of filter.conditions) {
      if ('conditions' in condition) {
        return true // Nested group
      }
    }

    return false
  }

  /**
   * Get the current configuration.
   */
  getConfig(): QueryRouterConfig {
    return { ...this.config }
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<QueryRouterConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// ─── Factory Function ──────────────────────────────────────────────────────────

/**
 * Create a query router with optional configuration.
 */
export function createQueryRouter(config?: Partial<QueryRouterConfig>): QueryRouter {
  return new QueryRouter(config)
}
