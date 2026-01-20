/**
 * Query federation types for distributed queries across peers
 */

/**
 * Generic query type (implementation-specific)
 */
export interface Query {
  type: string
  filters?: Record<string, unknown>
  limit?: number
  offset?: number
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

/**
 * A data source that can answer queries
 */
export interface DataSource {
  type: 'local' | 'peer' | 'cluster'
  id: string
  estimatedLatency: number
}

/**
 * A subquery to be executed on a specific source
 */
export interface SubQuery {
  source: DataSource
  query: Query
  estimatedCost: number
}

/**
 * A plan for executing a federated query
 */
export interface QueryPlan {
  subqueries: SubQuery[]
  aggregation: 'union' | 'join' | 'custom'
  customAggregator?: (results: unknown[][]) => unknown[]
}

/**
 * Interface for routing queries to appropriate sources
 */
export interface QueryRouter {
  /** Find which sources have relevant data */
  findSources(query: Query): Promise<DataSource[]>

  /** Route query to source */
  route(query: Query, source: DataSource): Promise<unknown[]>

  /** Aggregate results from multiple sources */
  aggregate(plan: QueryPlan, results: unknown[][]): unknown[]
}

/**
 * Wire protocol request for federated queries
 */
export interface QueryRequest {
  queryId: string
  query: Query
  auth: string // UCAN token
}

/**
 * Wire protocol response for federated queries
 */
export interface QueryResponse {
  queryId: string
  results: unknown[]
  hasMore: boolean
  cursor?: string
  error?: string
}

/**
 * Streaming query options
 */
export interface StreamingQueryOptions {
  batchSize: number
  timeout: number
  maxResults: number
}

/**
 * Default streaming options
 */
export const DEFAULT_STREAMING_OPTIONS: StreamingQueryOptions = {
  batchSize: 100,
  timeout: 30000, // 30 seconds
  maxResults: 10000
}

/**
 * Estimate query cost based on filters and limits
 */
export function estimateQueryCost(query: Query): number {
  let cost = 1

  // More filters = more selective = lower cost
  const filterCount = Object.keys(query.filters || {}).length
  cost *= Math.max(0.1, 1 - filterCount * 0.1)

  // Limit reduces cost
  if (query.limit) {
    cost *= Math.min(1, query.limit / 1000)
  }

  return cost
}

/**
 * Simple union aggregation
 */
export function unionAggregate<T>(results: T[][]): T[] {
  return results.flat()
}

/**
 * Deduplicated union aggregation (requires items to have id field)
 */
export function deduplicatedUnion<T extends { id: string }>(results: T[][]): T[] {
  const seen = new Set<string>()
  const output: T[] = []

  for (const batch of results) {
    for (const item of batch) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        output.push(item)
      }
    }
  }

  return output
}
