/**
 * PortSQLiteAdapter - SQLiteAdapter over a forwarded MessagePort
 *
 * Runs inside the data worker and speaks the same Comlink
 * `SQLiteWorkerHandler` protocol as `WebSQLiteProxy`, but over a
 * MessagePort transferred from the main thread instead of a Worker it
 * owns. This is option A of exploration 0164: the data worker hosts
 * NodeStore + invalidation while storage stays in the existing SQLite
 * worker — storage calls hop data worker → SQLite worker without
 * touching the main thread.
 *
 * The database lifecycle is owned by the main thread (which opened it
 * and applied the schema before forwarding the port), so `open()` only
 * verifies connectivity and `close()` only closes this port.
 */

import type {
  SQLiteAdapter,
  PreparedStatement,
  SQLiteConfig,
  SQLValue,
  SQLRow,
  RunResult,
  SQLBatchRead,
  SQLiteNodeBatchApplyInput,
  SQLiteNodeBatchApplyResult
} from '@xnetjs/sqlite'
// Type-only import: the web-worker module self-exposes via Comlink at
// runtime and must never be executed inside the data worker.
import type { SQLiteWorkerHandler } from '@xnetjs/sqlite/web-worker'
import { wrap, type Remote } from 'comlink'

export class PortSQLiteAdapter implements SQLiteAdapter {
  private port: MessagePort | null
  private proxy: Remote<SQLiteWorkerHandler> | null
  private inTransaction = false

  constructor(port: MessagePort) {
    this.port = port
    this.proxy = wrap<SQLiteWorkerHandler>(port)
  }

  async open(_config?: SQLiteConfig): Promise<void> {
    if (!this.proxy) throw new Error('Port closed')

    // The main thread already opened the database before forwarding the
    // port; just verify the worker on the other end is reachable.
    const isOpen = await this.proxy.isOpen()
    if (!isOpen) {
      throw new Error('PortSQLiteAdapter: database not open on the SQLite worker')
    }
  }

  async close(): Promise<void> {
    // The main thread owns the database lifecycle; only release the port.
    this.proxy = null
    this.port?.close()
    this.port = null
    this.inTransaction = false
  }

  isOpen(): boolean {
    return this.proxy !== null
  }

  private requireProxy(): Remote<SQLiteWorkerHandler> {
    if (!this.proxy) throw new Error('Database not open')
    return this.proxy
  }

  async query<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T[]> {
    const result = await this.requireProxy().query(sql, params)
    return result as T[]
  }

  async queryOne<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T | null> {
    const result = await this.requireProxy().queryOne(sql, params)
    return result as T | null
  }

  async queryBatch(reads: SQLBatchRead[]): Promise<SQLRow[][]> {
    if (reads.length === 0) return []
    return this.requireProxy().queryBatch(reads)
  }

  async run(sql: string, params?: SQLValue[]): Promise<RunResult> {
    return this.requireProxy().run(sql, params)
  }

  async exec(sql: string): Promise<void> {
    return this.requireProxy().exec(sql)
  }

  async transaction<T>(_fn: () => Promise<T>): Promise<T> {
    // Callback transactions can't cross the port boundary; mirror
    // WebSQLiteProxy and require transactionBatch()/applyNodeBatch().
    throw new Error('Complex transactions not supported over a port. Use transactionBatch().')
  }

  async transactionBatch(operations: Array<{ sql: string; params?: SQLValue[] }>): Promise<void> {
    await this.requireProxy().transaction(operations)
  }

  async applyNodeBatch(input: SQLiteNodeBatchApplyInput): Promise<SQLiteNodeBatchApplyResult> {
    return this.requireProxy().applyNodeBatch(input)
  }

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) {
      throw new Error('Transaction already in progress')
    }
    await this.requireProxy().exec('BEGIN IMMEDIATE')
    this.inTransaction = true
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress')
    }
    await this.requireProxy().exec('COMMIT')
    this.inTransaction = false
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      return
    }
    await this.requireProxy().exec('ROLLBACK')
    this.inTransaction = false
  }

  async prepare(_sql: string): Promise<PreparedStatement> {
    // Statement handles aren't serializable across the port.
    throw new Error('Prepared statements not supported over a port. Use query() or run().')
  }

  async getSchemaVersion(): Promise<number> {
    return this.requireProxy().getSchemaVersion()
  }

  // Schema versioning mirrors WebSQLiteProxy byte-for-byte on purpose:
  // both speak the same worker protocol against the same _schema_version
  // table, and diverging here would corrupt version tracking.
  async setSchemaVersion(version: number): Promise<void> {
    // fallow-ignore-next-line code-duplication
    await this.requireProxy().run(
      'INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)',
      [version, Date.now()]
    )
  }

  async applySchema(version: number, sql: string): Promise<boolean> {
    const currentVersion = await this.getSchemaVersion()
    if (currentVersion >= version) return false

    await this.exec(sql)
    await this.setSchemaVersion(version)
    return true
  }

  async getDatabaseSize(): Promise<number> {
    return this.requireProxy().getDatabaseSize()
  }

  async vacuum(): Promise<void> {
    return this.requireProxy().vacuum()
  }

  async checkpoint(): Promise<number> {
    // opfs-sahpool handles checkpointing internally
    return 0
  }

  async getStorageMode(): Promise<'opfs' | 'memory'> {
    return this.requireProxy().getStorageMode()
  }
}
