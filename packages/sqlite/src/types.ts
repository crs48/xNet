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
  /**
   * Emit boot diagnostics from the worker: a per-operation queue/exec timing
   * trace and a one-shot DB-stats line at open (exploration 0229). Set by the
   * main thread, which can read the `xnet:boot:debug` flag — the worker can't
   * (`localStorage` is unavailable in workers).
   */
  bootDebug?: boolean
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

export type SQLiteNodeBatchIndexMode = 'eager' | 'touched' | 'defer-schema'

export interface SQLiteNodeBatchNodeRow {
  id: string
  schemaId: string
  createdAt: number
  updatedAt: number
  createdBy: string
  deletedAt: number | null
  propertyKeys: string[]
}

export interface SQLiteNodeBatchPropertyRow {
  nodeId: string
  propertyKey: string
  value: Uint8Array | null
  lamportTime: number
  updatedBy: string
  updatedAt: number
}

export interface SQLiteNodeBatchChangeRow {
  hash: string
  nodeId: string
  payload: Uint8Array
  lamportTime: number
  lamportPeer: string
  wallTime: number
  author: string
  parentHash: string | null
  batchId: string | null
  signature: Uint8Array
}

export interface SQLiteNodeBatchScalarIndexRow {
  nodeId: string
  schemaId: string
  propertyKey: string
  valueType: string
  valueText: string | null
  valueNumber: number | null
  valueBoolean: number | null
  valueHash: string | null
  updatedAt: number
  lamportTime: number
}

export interface SQLiteNodeBatchFtsRow {
  nodeId: string
  title: string
  content: string
}

export interface SQLiteNodeBatchApplyInput {
  nodes: SQLiteNodeBatchNodeRow[]
  properties: SQLiteNodeBatchPropertyRow[]
  changes: SQLiteNodeBatchChangeRow[]
  scalarIndexRows: SQLiteNodeBatchScalarIndexRow[]
  ftsNodeIds: string[]
  ftsRows: SQLiteNodeBatchFtsRow[]
  affectedSchemaIds: string[]
  lastLamportTime: number
  indexMode: SQLiteNodeBatchIndexMode
}

export interface SQLiteNodeBatchApplyResult {
  nodeRowsWritten: number
  propertyRowsWritten: number
  changeRowsWritten: number
  scalarRowsWritten: number
  ftsRowsWritten: number
}
