/**
 * @xnet/sqlite - Main thread proxy for SQLite Web Worker
 *
 * This provides a SQLiteAdapter-compatible interface that communicates
 * with the SQLite worker via postMessage/Comlink.
 */

import type { SQLiteWorkerHandler } from './web-worker'
import type { SQLiteAdapter, PreparedStatement } from '../adapter'
import type { SQLiteConfig, SQLValue, SQLRow, RunResult } from '../types'
import * as Comlink from 'comlink'

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

  async open(config: SQLiteConfig): Promise<void> {
    if (this.worker) {
      throw new Error('Already open. Call close() first.')
    }

    // Create worker
    // The URL is resolved relative to this file's location at build time
    this.worker = new Worker(new URL('./web-worker.ts', import.meta.url), { type: 'module' })

    // Wrap with Comlink for RPC-style communication
    this.proxy = Comlink.wrap<SQLiteWorkerHandler>(this.worker)

    // Open database in worker
    await this.proxy.open(config)
    this._config = config
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
    await this.proxy.exec('BEGIN IMMEDIATE')
  }

  async commit(): Promise<void> {
    if (!this.proxy) throw new Error('Database not open')
    await this.proxy.exec('COMMIT')
  }

  async rollback(): Promise<void> {
    if (!this.proxy) throw new Error('Database not open')
    await this.proxy.exec('ROLLBACK')
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
