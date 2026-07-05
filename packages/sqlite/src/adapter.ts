/**
 * @xnetjs/sqlite - SQLite adapter interface definitions
 */

import type {
  SQLValue,
  SQLRow,
  RunResult,
  SQLiteConfig,
  SQLiteOperationStats,
  SQLBatchRead,
  SQLiteNodeBatchApplyInput,
  SQLiteNodeBatchApplyResult
} from './types'

/**
 * Unified SQLite adapter interface.
 *
 * All platform-specific implementations must implement this interface.
 * The interface uses async methods to support both sync (better-sqlite3)
 * and async (sqlite-wasm, expo-sqlite) implementations.
 */
export interface SQLiteAdapter {
  // ─── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Open the database connection.
   * Creates the database file if it doesn't exist.
   */
  open(config: SQLiteConfig): Promise<void>

  /**
   * Close the database connection.
   * Flushes any pending writes and releases resources.
   */
  close(): Promise<void>

  /**
   * Check if the database is currently open.
   */
  isOpen(): boolean

  // ─── Query Execution ───────────────────────────────────────────────────

  /**
   * Execute a single SQL statement that returns rows.
   * Use for SELECT queries.
   *
   * @param sql - SQL query string
   * @param params - Bound parameters
   * @returns Array of result rows
   *
   * @example
   * const nodes = await db.query<NodeRow>(
   *   'SELECT * FROM nodes WHERE schemaId = ?',
   *   ['xnet://Page/1.0']
   * )
   */
  query<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T[]>

  /**
   * Execute a single SQL statement that returns one row.
   * Use for SELECT queries expecting 0 or 1 result.
   *
   * @param sql - SQL query string
   * @param params - Bound parameters
   * @returns Single row or null if not found
   */
  queryOne<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T | null>

  /**
   * Execute a single SQL statement that modifies data.
   * Use for INSERT, UPDATE, DELETE queries.
   *
   * @param sql - SQL statement
   * @param params - Bound parameters
   * @returns Run result with changes count and last insert ID
   */
  run(sql: string, params?: SQLValue[]): Promise<RunResult>

  /**
   * Execute raw SQL that may contain multiple statements.
   * Use for schema creation and migrations.
   * Does not support parameter binding.
   *
   * @param sql - SQL statements (may be multiple, separated by semicolons)
   */
  exec(sql: string): Promise<void>

  /**
   * Execute several reads in one call, returning one row array per read
   * (positionally). For worker/port-backed adapters this crosses the RPC
   * boundary ONCE for the whole batch instead of once per query — the
   * amortization matters for multi-query screens and chunked hydrates
   * (exploration 0263). In-process adapters may simply loop.
   */
  queryBatch?(reads: SQLBatchRead[]): Promise<SQLRow[][]>

  // ─── Transactions ──────────────────────────────────────────────────────

  /**
   * Execute a function within a transaction.
   * Automatically commits on success, rolls back on error.
   *
   * @param fn - Function to execute within transaction
   * @returns Result of the function
   *
   * @example
   * await db.transaction(async () => {
   *   await db.run('INSERT INTO nodes ...')
   *   await db.run('INSERT INTO changes ...')
   * })
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>

  /**
   * Execute a list of SQL statements inside one transaction.
   *
   * This is primarily for proxy/worker-backed adapters where a callback
   * transaction would cross a serialization boundary. Implementations should
   * execute all operations atomically and roll back on the first failure.
   */
  transactionBatch?(operations: Array<{ sql: string; params?: SQLValue[] }>): Promise<void>

  /**
   * Execute a node-store batch using compact typed row payloads.
   *
   * Worker-backed adapters can use this to avoid transferring a very large
   * array of repeated SQL strings over Comlink.
   */
  applyNodeBatch?(input: SQLiteNodeBatchApplyInput): Promise<SQLiteNodeBatchApplyResult>

  /**
   * Begin a manual transaction.
   * Must be followed by commit() or rollback().
   */
  beginTransaction(): Promise<void>

  /**
   * Commit the current transaction.
   */
  commit(): Promise<void>

  /**
   * Rollback the current transaction.
   */
  rollback(): Promise<void>

  // ─── Prepared Statements ───────────────────────────────────────────────

  /**
   * Prepare a statement for repeated execution.
   * Useful for bulk operations.
   *
   * @param sql - SQL statement with placeholders
   * @returns Prepared statement handle
   */
  prepare(sql: string): Promise<PreparedStatement>

  // ─── Schema Management ─────────────────────────────────────────────────

  /**
   * Get the current schema version.
   * Returns 0 if no schema has been applied.
   */
  getSchemaVersion(): Promise<number>

  /**
   * Set the schema version after applying migrations.
   */
  setSchemaVersion(version: number): Promise<void>

  /**
   * Apply schema SQL if version is outdated.
   * Handles version checking and updating atomically.
   *
   * @param version - Target schema version
   * @param sql - Schema SQL to execute
   * @returns true if schema was applied, false if already up-to-date
   */
  applySchema(version: number, sql: string): Promise<boolean>

  // ─── Utilities ─────────────────────────────────────────────────────────

  /**
   * Get database file size in bytes.
   * Returns 0 for in-memory databases.
   */
  getDatabaseSize(): Promise<number>

  /**
   * Vacuum the database to reclaim space.
   */
  vacuum(): Promise<void>

  /**
   * Return freelist pages to the filesystem under `auto_vacuum=INCREMENTAL`,
   * optionally capped at `maxPages`. Returns the number of pages freed.
   *
   * This exists because `exec('PRAGMA incremental_vacuum')` is a silent
   * near-no-op on the WASM build: SQLite frees ONE page per `sqlite3_step` of
   * that pragma, and the oo1 `exec` path steps a statement only once when no
   * rows are collected — so the freelist shrank by a single page per call.
   * Implementations must step the pragma to completion. Optional: adapters
   * for engines that step pragmas fully anyway (or that never run under
   * incremental auto-vacuum) may omit it; callers fall back to `exec`.
   */
  incrementalVacuum?(maxPages?: number): Promise<number>

  /**
   * Checkpoint WAL file (for WAL mode databases).
   * Returns the number of frames checkpointed.
   */
  checkpoint(): Promise<number>

  /**
   * Get the current storage mode of the database.
   * Returns 'opfs' if using OPFS-backed persistent storage,
   * or 'memory' if using in-memory fallback.
   */
  getStorageMode(): Promise<'opfs' | 'memory'> | 'opfs' | 'memory'

  /**
   * Optional cumulative operation counters for import diagnostics.
   */
  getOperationStats?(): Promise<SQLiteOperationStats> | SQLiteOperationStats

  /**
   * Reset cumulative operation counters when starting a focused measurement.
   */
  resetOperationStats?(): Promise<void> | void
}

/**
 * Prepared statement for repeated execution.
 */
export interface PreparedStatement {
  /**
   * Execute the statement with parameters and return rows.
   */
  query<T extends SQLRow = SQLRow>(params?: SQLValue[]): Promise<T[]>

  /**
   * Execute the statement with parameters and return one row.
   */
  queryOne<T extends SQLRow = SQLRow>(params?: SQLValue[]): Promise<T | null>

  /**
   * Execute the statement with parameters for modification.
   */
  run(params?: SQLValue[]): Promise<RunResult>

  /**
   * Release the prepared statement.
   */
  finalize(): Promise<void>
}
