/**
 * @xnet/sqlite - Web Worker entry point for SQLite WASM
 *
 * This file runs in a Web Worker and handles all SQLite operations.
 * The main thread communicates with it via postMessage/Comlink.
 */

import type { SQLiteConfig, SQLValue, SQLRow, RunResult } from '../types'
import { WebSQLiteAdapter, createWebSQLiteAdapter } from './web'

/**
 * SQLite worker handler that wraps the adapter for message-based communication.
 */
class SQLiteWorkerHandler {
  private adapter: WebSQLiteAdapter | null = null

  async open(config: SQLiteConfig): Promise<void> {
    if (this.adapter) {
      throw new Error('Database already open')
    }
    this.adapter = await createWebSQLiteAdapter(config)
  }

  async close(): Promise<void> {
    if (this.adapter) {
      await this.adapter.close()
      this.adapter = null
    }
  }

  isOpen(): boolean {
    return this.adapter?.isOpen() ?? false
  }

  async query<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T[]> {
    if (!this.adapter) throw new Error('Database not open')
    return this.adapter.query<T>(sql, params)
  }

  async queryOne<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T | null> {
    if (!this.adapter) throw new Error('Database not open')
    return this.adapter.queryOne<T>(sql, params)
  }

  async run(sql: string, params?: SQLValue[]): Promise<RunResult> {
    if (!this.adapter) throw new Error('Database not open')
    return this.adapter.run(sql, params)
  }

  async exec(sql: string): Promise<void> {
    if (!this.adapter) throw new Error('Database not open')
    return this.adapter.exec(sql)
  }

  /**
   * Execute multiple operations in a single transaction.
   * This is the recommended way to do transactions across the worker boundary.
   */
  async transaction(operations: Array<{ sql: string; params?: SQLValue[] }>): Promise<void> {
    if (!this.adapter) throw new Error('Database not open')

    await this.adapter.transaction(async () => {
      for (const op of operations) {
        await this.adapter!.run(op.sql, op.params)
      }
    })
  }

  async getSchemaVersion(): Promise<number> {
    if (!this.adapter) throw new Error('Database not open')
    return this.adapter.getSchemaVersion()
  }

  async vacuum(): Promise<void> {
    if (!this.adapter) throw new Error('Database not open')
    return this.adapter.vacuum()
  }

  async getDatabaseSize(): Promise<number> {
    if (!this.adapter) throw new Error('Database not open')
    return this.adapter.getDatabaseSize()
  }
}

// Create handler instance
const handler = new SQLiteWorkerHandler()

// Use Comlink if available, otherwise use raw postMessage
async function initWorker(): Promise<void> {
  try {
    // Try to use Comlink for cleaner RPC-style communication
    const Comlink = await import('comlink')
    Comlink.expose(handler)
  } catch {
    // Fall back to raw postMessage handling
    self.onmessage = async (event: MessageEvent) => {
      const { id, method, args } = event.data as {
        id: number
        method: keyof SQLiteWorkerHandler
        args: unknown[]
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (handler as any)[method](...args)
        self.postMessage({ id, result })
      } catch (error) {
        self.postMessage({
          id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }
}

initWorker()

// Export handler type for type inference in the proxy
export type { SQLiteWorkerHandler }
