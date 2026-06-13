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
export { createSearchIndex, type SearchIndex, type SearchIndexOptions } from './search/index'
export {
  createSearchSnippet,
  extractBacklinks,
  extractDocumentLinks,
  extractDocumentText,
  extractSearchDocument,
  type DocumentLinkMatch,
  type SearchDocumentContent
} from './search/document'
export {
  summarizeSearchModeration,
  type SearchModerationLabel,
  type SearchModerationPolicy,
  type SearchModerationSignals,
  type SearchModerationSummary,
  type SearchQualitySignal
} from './search/moderation'

// Federation
export {
  createFederatedQueryRouter,
  type FederatedQueryRouter,
  type FederatedQueryRouterOptions,
  type RemoteQueryTransport
} from './federation/router'
