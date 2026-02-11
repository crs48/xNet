/**
 * @xnet/sqlite - Electron SQLite adapter using better-sqlite3
 *
 * better-sqlite3 provides synchronous SQLite access for Node.js/Electron.
 * The async interface is maintained for compatibility with other adapters.
 */

import type { SQLiteAdapter, PreparedStatement } from '../adapter'
import type { SQLValue, SQLRow, RunResult, SQLiteConfig } from '../types'
import type Database from 'better-sqlite3'
import { SCHEMA_DDL, SCHEMA_VERSION } from '../schema'

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
  private config: SQLiteConfig | null = null
  private inTransaction = false

  // Cached prepared statements for performance
  private statementCache = new Map<string, Database.Statement>()

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
  }

  async close(): Promise<void> {
    if (!this.db) return

    // Clear statement cache
    this.statementCache.clear()

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
  }

  isOpen(): boolean {
    return this.db !== null
  }

  async query<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T[]> {
    this.ensureOpen()

    try {
      const stmt = this.getOrPrepare(sql)
      const rows = params ? stmt.all(...params) : stmt.all()
      return rows as T[]
    } catch (err) {
      throw this.wrapError(err, sql)
    }
  }

  async queryOne<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T | null> {
    this.ensureOpen()

    try {
      const stmt = this.getOrPrepare(sql)
      const row = params ? stmt.get(...params) : stmt.get()
      return (row as T) ?? null
    } catch (err) {
      throw this.wrapError(err, sql)
    }
  }

  async run(sql: string, params?: SQLValue[]): Promise<RunResult> {
    this.ensureOpen()

    try {
      const stmt = this.getOrPrepare(sql)
      const result = params ? stmt.run(...params) : stmt.run()

      return {
        changes: result.changes,
        lastInsertRowid: BigInt(result.lastInsertRowid)
      }
    } catch (err) {
      throw this.wrapError(err, sql)
    }
  }

  async exec(sql: string): Promise<void> {
    this.ensureOpen()

    try {
      this.db!.exec(sql)
    } catch (err) {
      throw this.wrapError(err, sql)
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.ensureOpen()

    // Use better-sqlite3's transaction for sync operations
    // But we need to handle async fn, so we use manual begin/commit
    await this.beginTransaction()

    try {
      const result = await fn()
      await this.commit()
      return result
    } catch (err) {
      await this.rollback()
      throw err
    }
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
    if (this.inTransaction) {
      throw new Error('Transaction already in progress')
    }

    this.db!.exec('BEGIN IMMEDIATE')
    this.inTransaction = true
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress')
    }

    this.db!.exec('COMMIT')
    this.inTransaction = false
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      return // Silently ignore if no transaction (for cleanup in error handlers)
    }

    this.db!.exec('ROLLBACK')
    this.inTransaction = false
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
    this.db!.exec('VACUUM')
  }

  async checkpoint(): Promise<number> {
    // better-sqlite3 handles WAL checkpointing automatically
    return 0
  }

  getStorageMode(): 'opfs' | 'memory' {
    return 'opfs'
  }

  // ─── Helper Methods ─────────────────────────────────────────────────────

  /**
   * Get a statement from cache or prepare it.
   * Statement caching significantly improves performance for repeated queries.
   */
  private getOrPrepare(sql: string): Database.Statement {
    let stmt = this.statementCache.get(sql)

    if (!stmt) {
      stmt = this.db!.prepare(sql)
      this.statementCache.set(sql, stmt)
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
