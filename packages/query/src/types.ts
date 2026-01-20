/**
 * Query types for @xnet/query
 */

/**
 * Query structure
 */
export interface Query {
  type: QueryType
  filters: Filter[]
  sort?: Sort[]
  limit?: number
  offset?: number
}

/**
 * Document types that can be queried
 */
export type QueryType = 'page' | 'task' | 'database' | 'block' | 'any'

/**
 * Filter condition
 */
export interface Filter {
  field: string
  operator: FilterOperator
  value: unknown
}

/**
 * Available filter operators
 */
export type FilterOperator =
  | 'eq' // equals
  | 'ne' // not equals
  | 'gt' // greater than
  | 'gte' // greater than or equal
  | 'lt' // less than
  | 'lte' // less than or equal
  | 'in' // in array
  | 'nin' // not in array
  | 'contains' // string contains
  | 'startsWith' // string starts with
  | 'endsWith' // string ends with

/**
 * Sort specification
 */
export interface Sort {
  field: string
  direction: 'asc' | 'desc'
}

/**
 * Query result
 */
export interface QueryResult<T = unknown> {
  items: T[]
  total: number
  hasMore: boolean
  cursor?: string
}

/**
 * Search query
 */
export interface SearchQuery {
  text: string
  filters?: Filter[]
  limit?: number
}

/**
 * Search result
 */
export interface SearchResult {
  id: string
  type: string
  title: string
  snippet: string
  score: number
}
