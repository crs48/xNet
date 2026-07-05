/**
 * @xnetjs/sqlite - Unified SQLite adapter for xNet across all platforms
 */

// Types
export type {
  SQLValue,
  SQLRow,
  RunResult,
  SQLiteConfig,
  SQLBatchRead,
  SchemaVersion,
  SQLiteOperationStats,
  SQLiteNodeBatchIndexMode,
  SQLiteNodeBatchNodeRow,
  SQLiteNodeBatchPropertyRow,
  SQLiteNodeBatchChangeRow,
  SQLiteNodeBatchScalarIndexRow,
  SQLiteNodeBatchFtsRow,
  SQLiteNodeBatchApplyInput,
  SQLiteNodeBatchApplyResult,
  ElectronSQLiteDiagnostics
} from './types'

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
  detectSQLiteCapabilities,
  runAnalyze,
  checkIntegrity,
  explainQuery,
  timeQuery
} from './diagnostics'
export type {
  IndexInfo,
  TableStats,
  QueryPlanStep,
  DatabaseStats,
  SQLiteRuntimeCapabilities
} from './diagnostics'

// Browser support detection
export {
  checkBrowserSupport,
  checkPersistentStorage,
  getMemoryFallbackSessionCount,
  recordMemoryFallbackSession,
  isSilentPersistRequestSafe,
  requestPersistentStorage,
  showUnsupportedBrowserMessage,
  watchPersistentStoragePermission
} from './browser-support'
export type {
  BrowserSupport,
  PersistentStorageRequestOptions,
  PersistentStorageStatus
} from './browser-support'

// Error helpers
export { isSQLiteCorruptionError } from './errors'

// OPFS capability detection (exploration 0238) — pick/explain the durable
// backend a context (esp. a mobile webview) can support before opening.
export {
  detectOpfsCapability,
  supportsOpfs,
  supportsSyncAccessHandle,
  isCrossOriginIsolated
} from './adapters/opfs-capability'
export type {
  OpfsCapability,
  OpfsCapabilityScope,
  OpfsPersistenceMode
} from './adapters/opfs-capability'

// Re-export adapters for convenience (tree-shakeable)
// Users should prefer importing from subpaths for smaller bundles
