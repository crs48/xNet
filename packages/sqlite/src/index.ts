/**
 * @xnet/sqlite - Unified SQLite adapter for xNet across all platforms
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

// Browser support detection
export { checkBrowserSupport, showUnsupportedBrowserMessage } from './browser-support'
export type { BrowserSupport } from './browser-support'

// Re-export adapters for convenience (tree-shakeable)
// Users should prefer importing from subpaths for smaller bundles
