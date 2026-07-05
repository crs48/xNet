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
 * One read of a {@link SQLiteAdapter.queryBatch} call: a SELECT plus its
 * bound parameters. Results come back positionally, one row array per read.
 */
export interface SQLBatchRead {
  sql: string
  params?: SQLValue[]
}

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

  /**
   * Per-attempt timeout (ms) for the web worker's `open()` before the worker is
   * terminated and retried with a fresh one (default: 15000). A cold
   * `installOpfsSAHPoolVfs()` on a large DB file can intermittently exceed this —
   * usually because a prior boot leaked a worker still holding the file's
   * exclusive OPFS handle; terminating + retrying clears that contention rather
   * than hard-failing the boot (exploration 0253). Web adapter only.
   */
  openTimeoutMs?: number

  /**
   * Multi-tab leadership routing (exploration 0263). When Web Locks and
   * SharedWorker are available, tabs elect a leader that owns the SQLite
   * worker; other tabs route their storage RPCs to it instead of losing the
   * OPFS handle race and silently falling back to a non-durable `:memory:`
   * database (exploration 0204). Default: `true` where supported — set `false`
   * to force the previous per-tab behaviour. Web proxy only.
   */
  multiTab?: boolean

  // ─── Electron / better-sqlite3 only (exploration 0230) ───────────────────

  /**
   * Front every storage operation with the priority scheduler so a queued write
   * burst can't head-of-line block an interactive read, and a manual transaction
   * holds the connection exclusively (`BEGIN`…`COMMIT` can't be interleaved).
   * Default: `true`. Has no effect on the WASM/web adapters, which schedule in
   * their worker host instead.
   */
  scheduler?: boolean

  /**
   * Open a second, **read-only** `better-sqlite3` connection so plain reads use
   * a different connection than the writer (no contention with write locks).
   * Ignored for `:memory:` databases (each connection would be a separate DB).
   * Default: `false`.
   */
  readonlyReadConnection?: boolean

  /**
   * Spawn a pool of read-only `better-sqlite3` reader threads so **heavy** reads
   * (FTS, large aggregates, big scans) run in parallel on other cores instead of
   * blocking the data-process thread. `'auto'` sizes the pool to the host's core
   * count (capped). `0` / `undefined` disables it. Ignored for `:memory:`.
   * Default: disabled.
   */
  readerPoolSize?: number | 'auto'

  /**
   * Reads issued within this many milliseconds of the most recent commit route
   * to the writer connection (read-your-writes safety) instead of the read-only
   * connection / reader pool. WAL already makes committed writes visible across
   * in-process connections, so the default `0` trusts WAL; raise it only if a
   * platform shows stale cross-connection reads.
   */
  readYourWritesWindowMs?: number
}

/**
 * Point-in-time diagnostics for the Electron SQLite adapter (exploration 0230):
 * scheduler queue depth, reader-pool occupancy, and WAL growth. Surfaced to the
 * desktop diagnostics seam.
 */
export interface ElectronSQLiteDiagnostics {
  /** Scheduler lane depths + in-flight flag, or null when the scheduler is off. */
  scheduler: {
    interactive: number
    bulk: number
    write: number
    inFlight: boolean
  } | null
  /** Reader-thread pool occupancy, or null when no pool is configured. */
  readerPool: {
    size: number
    healthy: number
    inFlight: number
    dispatched: number
    failures: number
  } | null
  /** WAL file growth, or null when unavailable / not in WAL mode. */
  wal: {
    walBytes: number
    pageCount: number
  } | null
  /** Whether a read-only secondary connection is open. */
  readonlyConnection: boolean
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
