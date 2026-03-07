/**
 * @xnetjs/sqlite - Unified SQLite adapter for xNet across all platforms
 */

// Types
export type { SQLValue, SQLRow, RunResult, SQLiteConfig, SchemaVersion } from './types'

// Interface
export type { SQLiteAdapter, PreparedStatement } from './adapter'

// Schema
export {
  SCHEMA_VERSION,
  SCHEMA_DDL,
  SCHEMA_DDL_CORE,
  SCHEMA_DDL_FTS,
  SCHEMA_MIGRATIONS,
  getMigrationSQL
} from './schema'

// Query helpers
export {
  buildInsert,
  buildUpdate,
  buildSelect,
  buildBatchInsert,
  escapeLike
} from './query-builder'

// FTS5 helpers
export {
  updateNodeFTS,
  deleteNodeFTS,
  searchNodes,
  rebuildFTS,
  optimizeFTS,
  extractTextFromTipTap,
  extractSearchableContent
} from './fts'
export type { FTSSearchResult, FTSSearchOptions } from './fts'

// Diagnostics
export {
  getIndexInfo,
  analyzeQuery,
  analyzeTable,
  getAllTableStats,
  getDatabaseStats,
  runAnalyze,
  checkIntegrity,
  explainQuery,
  timeQuery
} from './diagnostics'
export type { IndexInfo, TableStats, QueryPlanStep, DatabaseStats } from './diagnostics'

// Browser support detection
export {
  checkBrowserSupport,
  requestPersistentStorage,
  showUnsupportedBrowserMessage
} from './browser-support'
export type { BrowserSupport, PersistentStorageStatus } from './browser-support'

// Re-export adapters for convenience (tree-shakeable)
// Users should prefer importing from subpaths for smaller bundles
