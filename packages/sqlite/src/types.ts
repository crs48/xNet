/**
 * @xnetjs/sqlite - Type definitions for unified SQLite adapter
 */

/**
 * SQL parameter types that can be bound to statements.
 */
export type SQLValue = string | number | bigint | Uint8Array | null

/**
 * Row type for query results.
 */
export type SQLRow = Record<string, SQLValue>

/**
 * Result of a mutation query (INSERT, UPDATE, DELETE).
 */
export interface RunResult {
  /** Number of rows affected by the query */
  changes: number
  /** Last inserted row ID (for INSERT with AUTOINCREMENT) */
  lastInsertRowid: bigint
}

/**
 * Configuration options for SQLite database.
 */
export interface SQLiteConfig {
  /** Database file path or name */
  path: string
  /** Enable WAL mode (default: true) */
  walMode?: boolean
  /** Enable foreign keys (default: true) */
  foreignKeys?: boolean
  /** Busy timeout in milliseconds (default: 5000) */
  busyTimeout?: number
}

/**
 * Schema version information.
 */
export interface SchemaVersion {
  version: number
  appliedAt: number
}

/**
 * Runtime operation counters for diagnosing SQLite import performance.
 *
 * Counts are cumulative until reset by the adapter. Proxy-backed adapters can
 * use `workerRequestCount` to show serialization-boundary pressure separately
 * from the SQL statements executed by SQLite.
 */
export interface SQLiteOperationStats {
  /** SELECT statements returning many rows. */
  queryCount: number
  /** SELECT statements returning at most one row. */
  queryOneCount: number
  /** INSERT, UPDATE, DELETE, or other mutation statements. */
  runCount: number
  /** Raw SQL executions, often schema or transaction control statements. */
  execCount: number
  /** Callback transactions requested through this adapter. */
  transactionCount: number
  /** Batch transactions requested through this adapter. */
  transactionBatchCount: number
  /** SQL operations included in batch transactions. */
  transactionBatchOperationCount: number
  /** Comlink or postMessage requests crossing into a worker. */
  workerRequestCount: number
}
