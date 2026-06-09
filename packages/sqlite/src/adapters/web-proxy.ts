/**
 * @xnetjs/sqlite - Main thread proxy for SQLite Web Worker
 *
 * This provides a SQLiteAdapter-compatible interface that communicates
 * with the SQLite worker via postMessage/Comlink.
 */

import type { SQLiteWorkerHandler } from './web-worker'
import type { SQLiteAdapter, PreparedStatement } from '../adapter'
import type { SQLiteConfig, SQLValue, SQLRow, RunResult } from '../types'
import * as Comlink from 'comlink'

function isDebugEnabled(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem('xnet:sqlite:debug') === 'true'
}

function log(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.log(...args)
  }
}

/**
 * Comlink-wrapped worker handler type
 */
type RemoteHandler = Comlink.Remote<SQLiteWorkerHandler>

/**
 * SQLite proxy for the main thread.
 *
 * This wraps the Web Worker and provides the SQLiteAdapter interface
 * for use in the main thread React components.
 *
 * @example
 * ```typescript
 * const proxy = await createWebSQLiteProxy({ path: '/xnet.db' })
 * const nodes = await proxy.query('SELECT * FROM nodes')
 * ```
 */
export class WebSQLiteProxy implements SQLiteAdapter {
  private worker: Worker | null = null
  private proxy: RemoteHandler | null = null
  private _config: SQLiteConfig | null = null
  private inTransaction = false

  private createWorkerProxy(): RemoteHandler {
    log('[WebSQLiteProxy] Creating worker...')

    this.worker = new Worker(new URL('./web-worker.js', import.meta.url), { type: 'module' })

    this.worker.onerror = (event) => {
      console.error('[WebSQLiteProxy] Worker error:', event)
    }

    this.worker.onmessageerror = (event) => {
      console.error('[WebSQLiteProxy] Worker message error:', event)
    }

    log('[WebSQLiteProxy] Worker created, wrapping with Comlink...')

    this.proxy = Comlink.wrap<SQLiteWorkerHandler>(this.worker)
    return this.proxy
  }

  async open(config: SQLiteConfig): Promise<void> {
    if (this.worker) {
      throw new Error('Already open. Call close() first.')
    }

    const proxy = this.createWorkerProxy()

    log('[WebSQLiteProxy] Calling proxy.open()...')

    // Open database in worker with timeout
    const openPromise = proxy.open(config)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Worker initialization timeout after 15s')), 15000)
    )

    await Promise.race([openPromise, timeoutPromise])
    log('[WebSQLiteProxy] proxy.open() completed')

    this._config = config
  }

  async resetStorage(config: SQLiteConfig): Promise<void> {
    if (this.worker) {
      throw new Error('Already open. Call close() first.')
    }

    const proxy = this.createWorkerProxy()
    const resetPromise = proxy.resetStorage(config)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Worker storage reset timeout after 15s')), 15000)
    )

    try {
      await Promise.race([resetPromise, timeoutPromise])
    } finally {
      await this.close()
    }
  }

  async close(): Promise<void> {
    if (this.proxy) {
      await this.proxy.close()
      this.proxy = null
    }

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }

    this._config = null
    this.inTransaction = false
  }

  isOpen(): boolean {
    return this.proxy !== null
  }

  async query<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T[]> {
    if (!this.proxy) throw new Error('Database not open')
    const result = await this.proxy.query(sql, params)
    return result as T[]
  }

  async queryOne<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T | null> {
    if (!this.proxy) throw new Error('Database not open')
    const result = await this.proxy.queryOne(sql, params)
    return result as T | null
  }

  async run(sql: string, params?: SQLValue[]): Promise<RunResult> {
    if (!this.proxy) throw new Error('Database not open')
    return this.proxy.run(sql, params)
  }

  async exec(sql: string): Promise<void> {
    if (!this.proxy) throw new Error('Database not open')
    return this.proxy.exec(sql)
  }

  async transaction<T>(_fn: () => Promise<T>): Promise<T> {
    // Complex transactions with callbacks can't easily cross the worker boundary
    // because functions aren't serializable. Use transactionBatch() instead.
    throw new Error('Complex transactions not supported in proxy. Use transactionBatch() instead.')
  }

  /**
   * Execute multiple operations in a single transaction.
   * This is the recommended way to do transactions across the worker boundary.
   *
   * @example
   * ```typescript
   * await proxy.transactionBatch([
   *   { sql: 'INSERT INTO nodes ...', params: [...] },
   *   { sql: 'UPDATE nodes ...', params: [...] }
   * ])
   * ```
   */
  async transactionBatch(operations: Array<{ sql: string; params?: SQLValue[] }>): Promise<void> {
    if (!this.proxy) throw new Error('Database not open')
    await this.proxy.transaction(operations)
  }

  async beginTransaction(): Promise<void> {
    if (!this.proxy) throw new Error('Database not open')
    if (this.inTransaction) {
      throw new Error('Transaction already in progress')
    }

    await this.proxy.exec('BEGIN IMMEDIATE')
    this.inTransaction = true
  }

  async commit(): Promise<void> {
    if (!this.proxy) throw new Error('Database not open')
    if (!this.inTransaction) {
      throw new Error('No transaction in progress')
    }

    await this.proxy.exec('COMMIT')
    this.inTransaction = false
  }

  async rollback(): Promise<void> {
    if (!this.proxy) throw new Error('Database not open')
    if (!this.inTransaction) {
      return
    }

    await this.proxy.exec('ROLLBACK')
    this.inTransaction = false
  }

  async prepare(_sql: string): Promise<PreparedStatement> {
    // Prepared statements can't cross the worker boundary because the
    // statement handle isn't serializable. Use query() or run() directly.
    throw new Error('Prepared statements not supported in proxy. Use query() or run() directly.')
  }

  async getSchemaVersion(): Promise<number> {
    if (!this.proxy) throw new Error('Database not open')
    return this.proxy.getSchemaVersion()
  }

  async setSchemaVersion(version: number): Promise<void> {
    if (!this.proxy) throw new Error('Database not open')
    await this.proxy.run('INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)', [
      version,
      Date.now()
    ])
  }

  async applySchema(version: number, sql: string): Promise<boolean> {
    const currentVersion = await this.getSchemaVersion()
    if (currentVersion >= version) return false

    await this.exec(sql)
    await this.setSchemaVersion(version)
    return true
  }

  async getDatabaseSize(): Promise<number> {
    if (!this.proxy) throw new Error('Database not open')
    return this.proxy.getDatabaseSize()
  }

  async vacuum(): Promise<void> {
    if (!this.proxy) throw new Error('Database not open')
    return this.proxy.vacuum()
  }

  async checkpoint(): Promise<number> {
    // opfs-sahpool handles checkpointing internally
    return 0
  }

  async getStorageMode(): Promise<'opfs' | 'memory'> {
    if (!this.proxy) throw new Error('Database not open')
    try {
      log('[WebSQLiteProxy] Calling proxy.getStorageMode()...')
      const mode = await this.proxy.getStorageMode()
      log('[WebSQLiteProxy] getStorageMode() returned:', mode)
      return mode
    } catch (err) {
      console.error('[WebSQLiteProxy] getStorageMode() failed:', err)
      throw err
    }
  }
}

/**
 * Create a WebSQLiteProxy ready for use.
 *
 * @example
 * ```typescript
 * const db = await createWebSQLiteProxy({ path: '/xnet.db' })
 * const nodes = await db.query('SELECT * FROM nodes')
 * await db.close()
 * ```
 */
export async function createWebSQLiteProxy(config: SQLiteConfig): Promise<WebSQLiteProxy> {
  const proxy = new WebSQLiteProxy()
  await proxy.open(config)
  return proxy
}

export async function resetWebSQLiteStorage(config: SQLiteConfig): Promise<void> {
  const proxy = new WebSQLiteProxy()
  await proxy.resetStorage(config)
}
