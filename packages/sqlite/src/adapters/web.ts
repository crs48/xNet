/**
 * @xnet/sqlite - Web SQLite adapter using @sqlite.org/sqlite-wasm
 *
 * Uses the official SQLite WASM package with OPFS for browser-based persistence.
 * Must run in a Web Worker for OPFS access.
 */

import type { SQLiteAdapter, PreparedStatement } from '../adapter'
import type { SQLValue, SQLRow, RunResult, SQLiteConfig } from '../types'
import { SCHEMA_DDL, SCHEMA_VERSION } from '../schema'

// We use 'any' types here because @sqlite.org/sqlite-wasm is a peer dependency
// that may not be installed at build time. The actual types are checked at runtime.
/* eslint-disable @typescript-eslint/no-explicit-any */

const DEBUG =
  typeof self !== 'undefined' &&
  typeof localStorage !== 'undefined' &&
  localStorage.getItem('xnet:sqlite:debug') === 'true'

function log(...args: unknown[]): void {
  if (DEBUG) {
    console.log(...args)
  }
}

/**
 * SQLite adapter for web browsers using @sqlite.org/sqlite-wasm.
 *
 * Uses the opfs-sahpool VFS for OPFS persistence which:
 * - Works in Safari 16.4+ (unlike the opfs VFS which needs 17+)
 * - Doesn't require COOP/COEP headers
 * - Provides best performance
 *
 * Must run in a Web Worker for OPFS access.
 *
 * @example
 * ```typescript
 * // In a Web Worker
 * const adapter = new WebSQLiteAdapter()
 * await adapter.open({ path: '/xnet.db' })
 *
 * const nodes = await adapter.query('SELECT * FROM nodes')
 * ```
 */
export class WebSQLiteAdapter implements SQLiteAdapter {
  private sqlite3: any = null
  private db: any = null
  private poolUtil: any = null
  private _config: SQLiteConfig | null = null
  private inTransaction = false
  private storageMode: 'opfs' | 'memory' = 'memory'

  async open(config: SQLiteConfig): Promise<void> {
    if (this.db !== null) {
      throw new Error('Database already open. Call close() first.')
    }

    log('[WebSQLiteAdapter] Starting open()...')

    // Dynamically import sqlite-wasm
    log('[WebSQLiteAdapter] Importing sqlite-wasm...')
    const sqlite3InitModule = (await import('@sqlite.org/sqlite-wasm')).default
    log('[WebSQLiteAdapter] sqlite-wasm imported')

    // Initialize the module
    log('[WebSQLiteAdapter] Initializing sqlite3 module...')
    this.sqlite3 = await sqlite3InitModule()
    log('[WebSQLiteAdapter] sqlite3 module initialized')

    // Install OPFS SAH Pool VFS
    // This is the recommended VFS for single-connection apps
    try {
      log('[WebSQLiteAdapter] Installing OPFS-SAHPool VFS...')
      this.poolUtil = await this.sqlite3.installOpfsSAHPoolVfs({
        name: 'opfs-sahpool',
        directory: '.xnet-sqlite',
        initialCapacity: 10, // Support ~3-4 databases with journals
        clearOnInit: false
      })
      log('[WebSQLiteAdapter] OPFS-SAHPool VFS installed')

      // Ensure we have enough capacity
      log('[WebSQLiteAdapter] Reserving capacity...')
      await this.poolUtil.reserveMinimumCapacity(10)
      log('[WebSQLiteAdapter] Capacity reserved')

      // Path must be absolute for opfs-sahpool
      const dbPath = config.path.startsWith('/') ? config.path : `/${config.path}`

      // Open database using the pool VFS
      log('[WebSQLiteAdapter] Opening database at', dbPath)
      this.db = new this.poolUtil.OpfsSAHPoolDb(dbPath, 'c')
      this.storageMode = 'opfs'
      log('[WebSQLiteAdapter] Database opened with OPFS-SAHPool')
    } catch (err) {
      // If OPFS-SAHPool fails, try OPFS direct database before in-memory fallback.
      // Safari can fail SAH pool setup but still support OPFS persistence.
      console.warn('[WebSQLiteAdapter] OPFS-SAHPool not available, trying OPFS direct mode:', err)

      const dbPath = config.path.startsWith('/') ? config.path : `/${config.path}`
      const opfsDbCtor = this.sqlite3?.oo1?.OpfsDb

      if (typeof opfsDbCtor === 'function') {
        try {
          this.db = new opfsDbCtor(dbPath, 'c')
          this.storageMode = 'opfs'
          log('[WebSQLiteAdapter] Database opened with OPFS direct mode')
        } catch (opfsErr) {
          console.warn(
            '[WebSQLiteAdapter] OPFS direct mode not available, using in-memory database:',
            opfsErr
          )
          this.db = new this.sqlite3.oo1.DB(':memory:', 'c')
          this.storageMode = 'memory'
          log('[WebSQLiteAdapter] In-memory database opened')
        }
      } else {
        console.warn('[WebSQLiteAdapter] OPFS direct mode unavailable, using in-memory database')
        this.db = new this.sqlite3.oo1.DB(':memory:', 'c')
        this.storageMode = 'memory'
        log('[WebSQLiteAdapter] In-memory database opened')
      }
    }

    this._config = config

    // Apply pragmas
    if (config.foreignKeys !== false) {
      this.execSync('PRAGMA foreign_keys = ON')
    }

    if (config.busyTimeout) {
      this.execSync(`PRAGMA busy_timeout = ${config.busyTimeout}`)
    } else {
      this.execSync('PRAGMA busy_timeout = 5000')
    }

    // Performance settings
    this.execSync('PRAGMA synchronous = NORMAL')
    this.execSync('PRAGMA cache_size = -64000') // 64MB
    this.execSync('PRAGMA temp_store = MEMORY')
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
    this.sqlite3 = null
    this.poolUtil = null
    this._config = null
  }

  isOpen(): boolean {
    return this.db !== null
  }

  getStorageMode(): 'opfs' | 'memory' {
    return this.storageMode
  }

  async query<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T[]> {
    this.ensureOpen()

    const rows: T[] = []

    this.db.exec({
      sql,
      bind: params as unknown[],
      rowMode: 'object',
      callback: (row: unknown) => {
        rows.push(row as T)
      }
    })

    return rows
  }

  async queryOne<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params)
    return rows[0] ?? null
  }

  async run(sql: string, params?: SQLValue[]): Promise<RunResult> {
    this.ensureOpen()

    this.db.exec({
      sql,
      bind: params as unknown[]
    })

    return {
      changes: this.sqlite3.capi.sqlite3_changes(this.db.pointer),
      lastInsertRowid: this.sqlite3.capi.sqlite3_last_insert_rowid(this.db.pointer)
    }
  }

  async exec(sql: string): Promise<void> {
    this.ensureOpen()
    this.execSync(sql)
  }

  private execSync(sql: string): void {
    this.db.exec({ sql })
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
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

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) {
      throw new Error('Transaction already in progress')
    }

    this.execSync('BEGIN IMMEDIATE')
    this.inTransaction = true
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress')
    }

    this.execSync('COMMIT')
    this.inTransaction = false
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      return // Silently ignore
    }

    this.execSync('ROLLBACK')
    this.inTransaction = false
  }

  async prepare(sql: string): Promise<PreparedStatement> {
    // The oo1 API doesn't expose prepared statements directly
    // We simulate them by storing the SQL and executing on demand
    return {
      query: async <T extends SQLRow = SQLRow>(params?: SQLValue[]): Promise<T[]> => {
        return this.query<T>(sql, params)
      },
      queryOne: async <T extends SQLRow = SQLRow>(params?: SQLValue[]): Promise<T | null> => {
        return this.queryOne<T>(sql, params)
      },
      run: async (params?: SQLValue[]): Promise<RunResult> => {
        return this.run(sql, params)
      },
      finalize: async () => {
        // No-op for oo1 API
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

    await this.transaction(async () => {
      await this.exec(sql)
      await this.setSchemaVersion(version)
    })

    return true
  }

  async getDatabaseSize(): Promise<number> {
    try {
      const row = await this.queryOne<{ size: number }>(
        'SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()'
      )
      return row?.size ?? 0
    } catch {
      return 0
    }
  }

  async vacuum(): Promise<void> {
    await this.exec('VACUUM')
  }

  async checkpoint(): Promise<number> {
    // opfs-sahpool handles this internally
    return 0
  }

  private ensureOpen(): void {
    if (!this.db || !this.sqlite3) {
      throw new Error('Database not open. Call open() first.')
    }
  }
}

/**
 * Create a WebSQLiteAdapter with schema applied.
 */
export async function createWebSQLiteAdapter(config: SQLiteConfig): Promise<WebSQLiteAdapter> {
  const adapter = new WebSQLiteAdapter()
  await adapter.open(config)
  await adapter.applySchema(SCHEMA_VERSION, SCHEMA_DDL)
  return adapter
}
