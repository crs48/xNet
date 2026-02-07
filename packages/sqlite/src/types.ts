/**
 * @xnet/sqlite - Type definitions for unified SQLite adapter
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
