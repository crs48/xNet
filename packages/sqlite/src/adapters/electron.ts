/**
 * @xnetjs/sqlite - Electron SQLite adapter using better-sqlite3
 *
 * better-sqlite3 provides synchronous SQLite access for Node.js/Electron.
 * The async interface is maintained for compatibility with other adapters.
 */

import type { SQLiteAdapter, PreparedStatement } from '../adapter'
import type {
  SQLValue,
  SQLRow,
  RunResult,
  SQLiteConfig,
  SQLiteNodeBatchApplyInput,
  SQLiteNodeBatchApplyResult,
  ElectronSQLiteDiagnostics
} from '../types'
import type Database from 'better-sqlite3'
import { isSQLiteCorruptionError } from '../errors'
import { SCHEMA_DDL, SCHEMA_VERSION } from '../schema'
import { ReaderPool, isHeavyRead, resolveReaderPoolSize, workerThreadsFactory } from './reader-pool'
import { WorkerScheduler } from './worker-scheduler'

/** Stable coalesce key for an idempotent read (same sql + params → same key). */
function readKey(op: string, sql: string, params?: SQLValue[]): string {
  return `${op} ${sql} ${params ? JSON.stringify(params) : ''}`
}

/** Rows applied per chunk before the bulk path yields to the event loop. */
const APPLY_NODE_BATCH_CHUNK_ROWS = 250

/** Monotonic clock, falling back to `Date.now` where `performance` is absent. */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/** Yield to the macrotask queue so queued reads/timers can run between chunks. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

// better-sqlite3 is imported dynamically to avoid bundling in web
let DatabaseConstructor: typeof Database | null = null

async function getBetterSqlite3(): Promise<typeof Database> {
  if (DatabaseConstructor) return DatabaseConstructor

  // Dynamic import for tree-shaking
  const module = await import('better-sqlite3')
  DatabaseConstructor = module.default
  return DatabaseConstructor
}

/**
 * SQLite adapter for Electron using better-sqlite3.
 *
 * better-sqlite3 is synchronous, which is ideal for Electron's utility process.
 * The async interface is maintained for compatibility with other adapters.
 *
 * @example
 * ```typescript
 * const adapter = new ElectronSQLiteAdapter()
 * await adapter.open({ path: '/path/to/xnet.db' })
 *
 * const nodes = await adapter.query('SELECT * FROM nodes')
 * ```
 */
export class ElectronSQLiteAdapter implements SQLiteAdapter {
  private db: Database.Database | null = null
  /** Optional read-only secondary connection (exploration 0230, Phase 0.5). */
  private readDb: Database.Database | null = null
  private config: SQLiteConfig | null = null
  private inTransaction = false

  // Cached prepared statements for performance (per connection)
  private statementCache = new Map<string, Database.Statement>()
  private readStatementCache = new Map<string, Database.Statement>()

  /** Priority scheduler fronting the writer connection (exploration 0230). */
  private scheduler: WorkerScheduler | null = null
  /** Read-only reader-thread pool for heavy parallel reads (Phase 1). */
  private readerPool: ReaderPool | null = null
  /** Monotonic clock of the most recent commit, for read-your-writes routing. */
  private lastCommitAt = 0

  async open(config: SQLiteConfig): Promise<void> {
    if (this.db) {
      throw new Error('Database already open. Call close() first.')
    }

    const Database = await getBetterSqlite3()

    this.db = new Database(config.path)
    this.config = config

    // Apply pragmas
    if (config.walMode !== false) {
      this.db.pragma('journal_mode = WAL')
    }

    if (config.foreignKeys !== false) {
      this.db.pragma('foreign_keys = ON')
    }

    if (config.busyTimeout) {
      this.db.pragma(`busy_timeout = ${config.busyTimeout}`)
    } else {
      this.db.pragma('busy_timeout = 5000')
    }

    // Performance optimizations
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -64000') // 64MB cache
    this.db.pragma('temp_store = MEMORY')

    // Priority scheduler (default on): orders interactive reads ahead of queued
    // writes and lets a manual transaction hold the connection exclusively.
    if (config.scheduler !== false) {
      this.scheduler = new WorkerScheduler()
    }

    const fileBacked = config.path !== ':memory:' && config.path !== ''

    // Read-only secondary connection so plain reads don't contend with the
    // writer's locks (Phase 0.5). Skipped for in-memory DBs.
    if (config.readonlyReadConnection && fileBacked) {
      try {
        this.readDb = new Database(config.path, { readonly: true, fileMustExist: true })
        this.readDb.pragma('busy_timeout = 5000')
        this.readDb.pragma('cache_size = -32000')
        this.readDb.pragma('temp_store = MEMORY')
      } catch {
        this.readDb = null // fall back to the writer connection for reads
      }
    }

    // Reader-thread pool for heavy parallel reads (Phase 1). Best-effort: if a
    // reader fails to boot, the pool degrades and reads fall back inline.
    if (fileBacked && config.readerPoolSize) {
      try {
        const os = await import('node:os')
        const cores =
          typeof os.availableParallelism === 'function'
            ? os.availableParallelism()
            : os.cpus().length
        const poolSize = resolveReaderPoolSize(config.readerPoolSize, config.path, cores)
        if (poolSize > 0) {
          const { Worker } = await import('node:worker_threads')
          this.readerPool = new ReaderPool({
            dbPath: config.path,
            size: poolSize,
            createWorker: workerThreadsFactory(Worker, config.path)
          })
        }
      } catch {
        this.readerPool = null // reads fall back to the inline connection
      }
    }
  }

  async close(): Promise<void> {
    if (!this.db) return

    // Clear statement caches
    this.statementCache.clear()
    this.readStatementCache.clear()

    if (this.readerPool) {
      await this.readerPool.close()
      this.readerPool = null
    }

    if (this.readDb) {
      try {
        this.readDb.close()
      } catch {
        // ignore
      }
      this.readDb = null
    }

    // Checkpoint WAL before close
    if (this.config?.walMode !== false) {
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)')
      } catch {
        // Ignore checkpoint errors on close
      }
    }

    this.db.close()
    this.db = null
    this.config = null
    this.scheduler = null
    this.inTransaction = false
  }

  isOpen(): boolean {
    return this.db !== null
  }

  async query<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T[]> {
    this.ensureOpen()

    // Inside a manual transaction, read from the writer so the caller observes
    // its own uncommitted writes (read-your-writes within the transaction).
    if (this.inTransaction) return this.queryRaw<T>(this.db!, this.statementCache, sql, params)

    // Heavy, non-transactional reads → reader pool (parallel, off-thread).
    if (this.shouldUsePool(sql)) {
      try {
        return await this.readerPool!.query<T>(sql, params)
      } catch {
        // fall through to the inline/scheduled path on any pool failure
      }
    }

    const conn = this.readConnection()
    if (this.scheduler) {
      return this.scheduler.schedule(
        'interactive',
        async () => this.queryRaw<T>(conn.db, conn.cache, sql, params),
        readKey('query', sql, params),
        'query'
      )
    }
    return this.queryRaw<T>(conn.db, conn.cache, sql, params)
  }

  async queryBatch(reads: Array<{ sql: string; params?: SQLValue[] }>): Promise<SQLRow[][]> {
    // Route each member through query() so per-read semantics (reader pool for
    // heavy reads, scheduler lanes, read-your-writes in transactions) hold.
    // There is no RPC boundary here to amortize — this exists for interface
    // parity with the worker-backed adapters (exploration 0263).
    const results: SQLRow[][] = []
    for (const read of reads) {
      results.push(await this.query(read.sql, read.params))
    }
    return results
  }

  async queryOne<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T | null> {
    this.ensureOpen()

    if (this.inTransaction) return this.queryOneRaw<T>(this.db!, this.statementCache, sql, params)

    if (this.shouldUsePool(sql)) {
      try {
        return await this.readerPool!.queryOne<T>(sql, params)
      } catch {
        // fall through
      }
    }

    const conn = this.readConnection()
    if (this.scheduler) {
      return this.scheduler.schedule(
        'interactive',
        async () => this.queryOneRaw<T>(conn.db, conn.cache, sql, params),
        readKey('queryOne', sql, params),
        'queryOne'
      )
    }
    return this.queryOneRaw<T>(conn.db, conn.cache, sql, params)
  }

  async run(sql: string, params?: SQLValue[]): Promise<RunResult> {
    this.ensureOpen()
    // Within a transaction the writer is already held exclusively — run inline.
    if (this.inTransaction) return this.runRaw(sql, params)
    if (this.scheduler) {
      return this.scheduler.schedule(
        'write',
        async () => this.runRaw(sql, params),
        undefined,
        'run'
      )
    }
    return this.runRaw(sql, params)
  }

  async exec(sql: string): Promise<void> {
    this.ensureOpen()
    if (this.inTransaction) return this.execRaw(sql)
    if (this.scheduler) {
      return this.scheduler.schedule('write', async () => this.execRaw(sql), undefined, 'exec')
    }
    return this.execRaw(sql)
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.ensureOpen()

    // Acquire the worker exclusively (manual begin/commit spans several calls).
    await this.beginTransaction()

    try {
      const result = await fn()
      await this.commit()
      return result
    } catch (err) {
      if (this.inTransaction) {
        try {
          await this.rollback()
        } catch (rollbackErr) {
          if (isSQLiteCorruptionError(rollbackErr) && !isSQLiteCorruptionError(err)) {
            throw rollbackErr
          }
        }
      }
      throw err
    }
  }

  async transactionBatch(operations: Array<{ sql: string; params?: SQLValue[] }>): Promise<void> {
    this.ensureOpen()
    if (operations.length === 0) return

    const apply = (): void => {
      let currentSql = operations[0].sql
      try {
        this.transactionSync(() => {
          for (const operation of operations) {
            currentSql = operation.sql
            const stmt = this.getOrPrepare(operation.sql)
            if (operation.params) {
              stmt.run(...operation.params)
            } else {
              stmt.run()
            }
          }
        })
      } catch (err) {
        throw this.wrapError(err, currentSql)
      }
      this.lastCommitAt = nowMs()
    }

    // Already inside a manual transaction → run inline (better-sqlite3 nests via
    // a savepoint). Otherwise order it on the write lane like any other write.
    if (this.inTransaction) {
      apply()
      return
    }
    if (this.scheduler) {
      await this.scheduler.schedule('write', async () => apply(), undefined, 'transactionBatch')
      return
    }
    apply()
  }

  /**
   * Synchronous transaction for performance-critical batch operations.
   * Prefer this over async transaction when the body is synchronous.
   */
  transactionSync<T>(fn: () => T): T {
    this.ensureOpen()

    const txn = this.db!.transaction(fn)
    return txn()
  }

  async beginTransaction(): Promise<void> {
    this.ensureOpen()
    if (this.inTransaction) {
      throw new Error('Transaction already in progress')
    }

    // Manual transactions run inline on the writer: the owner's subsequent
    // run()/query() calls observe `inTransaction` and execute directly, so the
    // BEGIN…COMMIT span is one synchronous-on-the-connection sequence. (Same
    // single-connection semantics as before 0230 — the scheduler only reorders
    // *non-transactional* work.)
    this.db!.exec('BEGIN IMMEDIATE')
    this.inTransaction = true
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress')
    }

    try {
      this.db!.exec('COMMIT')
      this.inTransaction = false
      this.lastCommitAt = nowMs()
    } catch (err) {
      if (isSQLiteCorruptionError(err)) {
        this.inTransaction = false
      }
      throw err
    }
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      return // Silently ignore if no transaction (for cleanup in error handlers)
    }

    try {
      this.db!.exec('ROLLBACK')
    } finally {
      this.inTransaction = false
    }
  }

  async prepare(sql: string): Promise<PreparedStatement> {
    this.ensureOpen()

    const stmt = this.db!.prepare(sql)

    return {
      query: async <T extends SQLRow = SQLRow>(params?: SQLValue[]): Promise<T[]> => {
        const rows = params ? stmt.all(...params) : stmt.all()
        return rows as T[]
      },
      queryOne: async <T extends SQLRow = SQLRow>(params?: SQLValue[]): Promise<T | null> => {
        const row = params ? stmt.get(...params) : stmt.get()
        return (row as T) ?? null
      },
      run: async (params?: SQLValue[]): Promise<RunResult> => {
        const result = params ? stmt.run(...params) : stmt.run()
        return {
          changes: result.changes,
          lastInsertRowid: BigInt(result.lastInsertRowid)
        }
      },
      finalize: async () => {
        // better-sqlite3 auto-finalizes statements
      }
    }
  }

  async getSchemaVersion(): Promise<number> {
    try {
      const row = await this.queryOne<{ version: number }>(
        'SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1'
      )
      return row?.version ?? 0
    } catch {
      // Table doesn't exist yet
      return 0
    }
  }

  async setSchemaVersion(version: number): Promise<void> {
    await this.run('INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)', [
      version,
      Date.now()
    ])
  }

  async applySchema(version: number, sql: string): Promise<boolean> {
    const currentVersion = await this.getSchemaVersion()

    if (currentVersion >= version) {
      return false
    }

    return this.transactionSync(() => {
      this.db!.exec(sql)
      this.db!.prepare('INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)').run(
        version,
        Date.now()
      )
      return true
    })
  }

  async getDatabaseSize(): Promise<number> {
    try {
      const row = await this.queryOne<{ page_count: number; page_size: number }>(
        'SELECT page_count, page_size FROM pragma_page_count(), pragma_page_size()'
      )

      if (row) {
        return row.page_count * row.page_size
      }

      // Fallback: use file system
      if (this.config?.path && this.config.path !== ':memory:') {
        const { statSync } = await import('fs')
        try {
          const stats = statSync(this.config.path)
          return stats.size
        } catch {
          return 0
        }
      }

      return 0
    } catch {
      return 0
    }
  }

  async vacuum(): Promise<void> {
    this.ensureOpen()
    if (this.inTransaction) {
      this.db!.exec('VACUUM')
      return
    }
    if (this.scheduler) {
      await this.scheduler.schedule(
        'write',
        async () => this.db!.exec('VACUUM'),
        undefined,
        'vacuum'
      )
      return
    }
    this.db!.exec('VACUUM')
  }

  async incrementalVacuum(maxPages?: number): Promise<number> {
    this.ensureOpen()
    // better-sqlite3's pragma() steps the statement to completion, so unlike
    // the WASM oo1 exec path this frees the whole freelist in one call. Report
    // pages freed via the freelist delta.
    const pragma =
      maxPages !== undefined && maxPages > 0
        ? `incremental_vacuum(${Math.floor(maxPages)})`
        : 'incremental_vacuum'
    const runIt = () => {
      const before = this.db!.pragma('freelist_count', { simple: true }) as number
      this.db!.pragma(pragma)
      const after = this.db!.pragma('freelist_count', { simple: true }) as number
      return Math.max(0, before - after)
    }
    if (this.inTransaction) {
      return runIt()
    }
    if (this.scheduler) {
      return this.scheduler.schedule('write', async () => runIt(), undefined, 'incremental_vacuum')
    }
    return runIt()
  }

  async checkpoint(): Promise<number> {
    // better-sqlite3 handles WAL checkpointing automatically
    return 0
  }

  getStorageMode(): 'opfs' | 'memory' {
    return 'opfs'
  }

  /**
   * Apply a node-store batch with cooperative yielding (exploration 0230).
   *
   * A bulk import is the one synchronous op long enough to head-of-line block
   * interactive reads on the data-process thread. This splits the batch into
   * chunks, each its own exclusive transaction, and yields to the event loop
   * between chunks so a queued interactive read (or a reader-pool read) can
   * interleave. Whole-batch atomicity is traded for yield points — safe here
   * because node-batch writes are idempotent LWW upserts.
   */
  async applyNodeBatch(input: SQLiteNodeBatchApplyInput): Promise<SQLiteNodeBatchApplyResult> {
    this.ensureOpen()

    const indexed = input.indexMode !== 'defer-schema'
    const invalidatedAt = Date.now()

    // Build the ordered op list once, then drain it in chunks.
    const ops: Array<() => void> = []
    const nodeStmt = (): Database.Statement =>
      this.getOrPrepare(
        `INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           schema_id = excluded.schema_id,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at`
      )

    for (const node of input.nodes) {
      ops.push(() =>
        nodeStmt().run(
          node.id,
          node.schemaId,
          node.createdAt,
          node.updatedAt,
          node.createdBy,
          node.deletedAt
        )
      )
      if (node.propertyKeys.length === 0) {
        ops.push(() =>
          this.getOrPrepare('DELETE FROM node_properties WHERE node_id = ?').run(node.id)
        )
      } else {
        const placeholders = node.propertyKeys.map(() => '?').join(', ')
        ops.push(() =>
          this.getOrPrepare(
            `DELETE FROM node_properties WHERE node_id = ? AND property_key NOT IN (${placeholders})`
          ).run(node.id, ...node.propertyKeys)
        )
      }
    }

    for (const property of input.properties) {
      ops.push(() =>
        this.getOrPrepare(
          `INSERT INTO node_properties
              (node_id, property_key, value, lamport_time, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(node_id, property_key) DO UPDATE SET
              value = excluded.value,
              lamport_time = excluded.lamport_time,
              updated_by = excluded.updated_by,
              updated_at = excluded.updated_at
            WHERE excluded.lamport_time > node_properties.lamport_time`
        ).run(
          property.nodeId,
          property.propertyKey,
          property.value,
          property.lamportTime,
          property.updatedBy,
          property.updatedAt
        )
      )
    }

    if (indexed) {
      for (const node of input.nodes) {
        ops.push(() =>
          this.getOrPrepare('DELETE FROM node_property_scalars WHERE node_id = ?').run(node.id)
        )
      }
      for (const row of input.scalarIndexRows) {
        ops.push(() =>
          this.getOrPrepare(
            `INSERT INTO node_property_scalars
                (node_id, schema_id, property_key, value_type, value_text,
                 value_number, value_boolean, value_hash, updated_at, lamport_time)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            row.nodeId,
            row.schemaId,
            row.propertyKey,
            row.valueType,
            row.valueText,
            row.valueNumber,
            row.valueBoolean,
            row.valueHash,
            row.updatedAt,
            row.lamportTime
          )
        )
      }
      for (const nodeId of input.ftsNodeIds) {
        ops.push(() => this.getOrPrepare('DELETE FROM nodes_fts WHERE node_id = ?').run(nodeId))
      }
      for (const row of input.ftsRows) {
        ops.push(() =>
          this.getOrPrepare('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)').run(
            row.nodeId,
            row.title,
            row.content
          )
        )
      }
    }

    for (const change of input.changes) {
      ops.push(() =>
        this.getOrPrepare(
          `INSERT OR IGNORE INTO changes
            (hash, node_id, payload, lamport_time, lamport_peer, wall_time, author, parent_hash, batch_id, signature)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          change.hash,
          change.nodeId,
          change.payload,
          change.lamportTime,
          change.lamportPeer,
          change.wallTime,
          change.author,
          change.parentHash,
          change.batchId,
          change.signature
        )
      )
    }

    ops.push(() =>
      this.getOrPrepare(
        `INSERT INTO sync_state (key, value) VALUES ('lastLamportTime', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(String(input.lastLamportTime))
    )

    if (indexed) {
      for (const schemaId of input.affectedSchemaIds) {
        ops.push(() =>
          this.getOrPrepare(
            `UPDATE node_query_materializations
             SET invalidated_at = ?
             WHERE schema_id = ? AND invalidated_at IS NULL`
          ).run(invalidatedAt, schemaId)
        )
      }
    }

    // If a manual transaction is already open, run inline within it (the caller
    // owns atomicity). Otherwise drain in chunks — each its own atomic
    // transaction — yielding to the event loop in between so a queued
    // interactive read (or a reader-pool read) interleaves mid-import.
    if (this.inTransaction) {
      for (const op of ops) op()
    } else {
      for (let i = 0; i < ops.length; i += APPLY_NODE_BATCH_CHUNK_ROWS) {
        const chunk = ops.slice(i, i + APPLY_NODE_BATCH_CHUNK_ROWS)
        await this.runChunkTransaction(() => {
          for (const op of chunk) op()
        })
        if (i + APPLY_NODE_BATCH_CHUNK_ROWS < ops.length) await yieldToEventLoop()
      }
    }

    return {
      nodeRowsWritten: input.nodes.length,
      propertyRowsWritten: input.properties.length,
      changeRowsWritten: input.changes.length,
      scalarRowsWritten: input.scalarIndexRows.length,
      ftsRowsWritten: input.ftsRows.length
    }
  }

  /** Scheduler queue depths (diagnostics / desktop perf panel). */
  getSchedulerSnapshot(): ElectronSQLiteDiagnostics['scheduler'] {
    return this.scheduler ? this.scheduler.snapshot() : null
  }

  /** Reader-thread pool occupancy, or null when no pool is configured. */
  getReaderPoolStats(): ElectronSQLiteDiagnostics['readerPool'] {
    return this.readerPool ? this.readerPool.stats() : null
  }

  /**
   * WAL growth: `-wal` sidecar size + page count. Long-lived readers can pin an
   * old snapshot and hold back checkpointing; our one-shot reader selects don't,
   * so this should stay bounded. Surfaced to the diagnostics seam (0230).
   */
  async getWalStats(): Promise<ElectronSQLiteDiagnostics['wal']> {
    if (!this.db || this.config?.walMode === false) return null
    try {
      const path = this.config?.path
      let walBytes = 0
      if (path && path !== ':memory:') {
        const { statSync } = await import('fs')
        try {
          walBytes = statSync(`${path}-wal`).size
        } catch {
          walBytes = 0
        }
      }
      const page = this.db.pragma('page_count', { simple: true }) as number
      return { walBytes, pageCount: typeof page === 'number' ? page : 0 }
    } catch {
      return null
    }
  }

  /** Run a passive WAL checkpoint; returns frames checkpointed (best-effort). */
  async checkpointWal(): Promise<number> {
    if (!this.db || this.config?.walMode === false) return 0
    return this.scheduler
      ? this.scheduler.schedule('bulk', async () => this.runCheckpoint(), undefined, 'checkpoint')
      : this.runCheckpoint()
  }

  private runCheckpoint(): number {
    try {
      const result = this.db!.pragma('wal_checkpoint(PASSIVE)') as Array<{ checkpointed?: number }>
      return result?.[0]?.checkpointed ?? 0
    } catch {
      return 0
    }
  }

  /** Combined point-in-time diagnostics for the desktop diagnostics seam. */
  async getDiagnostics(): Promise<ElectronSQLiteDiagnostics> {
    return {
      scheduler: this.getSchedulerSnapshot(),
      readerPool: this.getReaderPoolStats(),
      wal: await this.getWalStats(),
      readonlyConnection: this.readDb !== null
    }
  }

  // ─── Helper Methods ─────────────────────────────────────────────────────

  /** Whether a heavy, non-transactional read should be offloaded to the pool. */
  private shouldUsePool(sql: string): boolean {
    return (
      this.readerPool !== null &&
      this.readerPool.isHealthy() &&
      isHeavyRead(sql) &&
      !this.inReadYourWritesWindow()
    )
  }

  /** Reads within the configured window after a commit route to the writer. */
  private inReadYourWritesWindow(): boolean {
    const window = this.config?.readYourWritesWindowMs ?? 0
    if (window <= 0) return false
    return nowMs() - this.lastCommitAt < window
  }

  /** Pick the connection (+ its statement cache) a plain read should use. */
  private readConnection(): { db: Database.Database; cache: Map<string, Database.Statement> } {
    if (this.readDb && !this.inReadYourWritesWindow()) {
      return { db: this.readDb, cache: this.readStatementCache }
    }
    return { db: this.db!, cache: this.statementCache }
  }

  /**
   * Run `apply` as a single atomic chunk transaction. Scheduled as one write-lane
   * job so it is indivisible w.r.t. the scheduler — no queued read or write can
   * interleave mid-chunk — while the surrounding `applyNodeBatch` yields *between*
   * chunks. `apply` is fully synchronous (no awaits), so `inTransaction` is set
   * only for its duration and is invisible to other async callers.
   */
  private runChunkTransaction(apply: () => void): Promise<void> {
    const exec = (): void => {
      this.inTransaction = true
      try {
        this.db!.exec('BEGIN IMMEDIATE')
        try {
          apply()
          this.db!.exec('COMMIT')
          this.lastCommitAt = nowMs()
        } catch (err) {
          try {
            this.db!.exec('ROLLBACK')
          } catch {
            // ignore rollback failure; surface the original error
          }
          throw err
        }
      } finally {
        this.inTransaction = false
      }
    }
    return this.scheduler
      ? this.scheduler.schedule('write', async () => exec(), undefined, 'applyNodeBatch')
      : Promise.resolve().then(exec)
  }

  private queryRaw<T extends SQLRow = SQLRow>(
    db: Database.Database,
    cache: Map<string, Database.Statement>,
    sql: string,
    params?: SQLValue[]
  ): T[] {
    try {
      const stmt = this.getOrPrepareOn(db, cache, sql)
      const rows = params ? stmt.all(...params) : stmt.all()
      return rows as T[]
    } catch (err) {
      throw this.wrapError(err, sql)
    }
  }

  private queryOneRaw<T extends SQLRow = SQLRow>(
    db: Database.Database,
    cache: Map<string, Database.Statement>,
    sql: string,
    params?: SQLValue[]
  ): T | null {
    try {
      const stmt = this.getOrPrepareOn(db, cache, sql)
      const row = params ? stmt.get(...params) : stmt.get()
      return (row as T) ?? null
    } catch (err) {
      throw this.wrapError(err, sql)
    }
  }

  private runRaw(sql: string, params?: SQLValue[]): RunResult {
    try {
      const stmt = this.getOrPrepare(sql)
      const result = params ? stmt.run(...params) : stmt.run()
      this.lastCommitAt = nowMs()
      return {
        changes: result.changes,
        lastInsertRowid: BigInt(result.lastInsertRowid)
      }
    } catch (err) {
      throw this.wrapError(err, sql)
    }
  }

  private execRaw(sql: string): void {
    try {
      this.db!.exec(sql)
      this.lastCommitAt = nowMs()
    } catch (err) {
      throw this.wrapError(err, sql)
    }
  }

  /**
   * Get a statement from cache or prepare it on the writer connection.
   * Statement caching significantly improves performance for repeated queries.
   */
  private getOrPrepare(sql: string): Database.Statement {
    return this.getOrPrepareOn(this.db!, this.statementCache, sql)
  }

  /** Statement cache keyed per connection (writer + read-only differ). */
  private getOrPrepareOn(
    db: Database.Database,
    cache: Map<string, Database.Statement>,
    sql: string
  ): Database.Statement {
    let stmt = cache.get(sql)
    if (!stmt) {
      stmt = db.prepare(sql)
      cache.set(sql, stmt)
    }
    return stmt
  }

  private ensureOpen(): void {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.')
    }
  }

  private wrapError(err: unknown, sql: string): Error {
    const message = err instanceof Error ? err.message : String(err)
    return new Error(
      `SQLite error: ${message}\nSQL: ${sql.slice(0, 200)}${sql.length > 200 ? '...' : ''}`
    )
  }

  // ─── Electron-Specific Methods ──────────────────────────────────────────

  /**
   * Get the underlying better-sqlite3 database instance.
   * Use for advanced operations not covered by the interface.
   */
  getRawDatabase(): Database.Database {
    this.ensureOpen()
    return this.db!
  }

  /**
   * Create a batch writer for efficient bulk inserts.
   */
  createBatchWriter(options?: { maxBatchSize?: number }): ElectronBatchWriter {
    return new ElectronBatchWriter(this, options)
  }
}

/**
 * Batch writer for efficient bulk operations.
 * Batches multiple writes and executes them in a single transaction.
 */
export class ElectronBatchWriter {
  private adapter: ElectronSQLiteAdapter
  private pendingOps: Array<{ sql: string; params: SQLValue[] }> = []
  private maxBatchSize: number
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushPromise: Promise<void> | null = null

  constructor(adapter: ElectronSQLiteAdapter, options?: { maxBatchSize?: number }) {
    this.adapter = adapter
    this.maxBatchSize = options?.maxBatchSize ?? 100
  }

  /**
   * Queue an operation for batch execution.
   */
  queue(sql: string, params: SQLValue[]): void {
    this.pendingOps.push({ sql, params })

    if (this.pendingOps.length >= this.maxBatchSize) {
      this.flush()
    } else if (!this.flushTimer) {
      // Flush after short delay if no more writes
      this.flushTimer = setTimeout(() => this.flush(), 50)
    }
  }

  /**
   * Flush all pending operations.
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    if (this.pendingOps.length === 0) return

    // If already flushing, wait for it
    if (this.flushPromise) {
      await this.flushPromise
      return this.flush() // Check if more ops queued during wait
    }

    const ops = this.pendingOps
    this.pendingOps = []

    this.flushPromise = (async () => {
      this.adapter.transactionSync(() => {
        const db = this.adapter.getRawDatabase()
        for (const { sql, params } of ops) {
          db.prepare(sql).run(...params)
        }
      })
    })()

    try {
      await this.flushPromise
    } finally {
      this.flushPromise = null
    }
  }

  /**
   * Close the batch writer, flushing any pending operations.
   */
  async close(): Promise<void> {
    await this.flush()
  }
}

// ─── Factory Functions ───────────────────────────────────────────────────────

/**
 * Create an ElectronSQLiteAdapter with schema applied.
 */
export async function createElectronSQLiteAdapter(
  config: SQLiteConfig
): Promise<ElectronSQLiteAdapter> {
  const adapter = new ElectronSQLiteAdapter()
  await adapter.open(config)
  await adapter.applySchema(SCHEMA_VERSION, SCHEMA_DDL)
  return adapter
}

// Re-export schema constants for convenience
export { SCHEMA_VERSION, SCHEMA_DDL }
