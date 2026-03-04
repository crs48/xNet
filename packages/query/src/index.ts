/**
 * @xnetjs/query - Local and federated queries, full-text search
 */

// Types
export type {
  Query,
  QueryType,
  Filter,
  FilterOperator,
  Sort,
  QueryResult,
  SearchQuery,
  SearchResult
} from './types'

// Local query engine
export { createLocalQueryEngine, type LocalQueryEngine } from './local/engine'

// Search index
export { createSearchIndex, type SearchIndex } from './search/index'

// Federation
export { createFederatedQueryRouter, type FederatedQueryRouter } from './federation/router'
