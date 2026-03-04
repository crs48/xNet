/**
 * @xnetjs/sqlite - Web Worker entry point for SQLite WASM
 *
 * This file runs in a Web Worker and handles all SQLite operations.
 * The main thread communicates with it via postMessage/Comlink.
 */

import type { SQLiteConfig, SQLValue, SQLRow, RunResult } from '../types'
import * as Comlink from 'comlink'
import { WebSQLiteAdapter, createWebSQLiteAdapter } from './web'

function isDebugEnabled(): boolean {
  return (
    typeof self !== 'undefined' &&
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('xnet:sqlite:debug') === 'true'
  )
}

function log(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.log(...args)
  }
}

log('[SQLiteWorker] Worker script loaded, Comlink imported')

/**
 * SQLite worker handler that wraps the adapter for message-based communication.
 */
class SQLiteWorkerHandler {
  private adapter: WebSQLiteAdapter | null = null

  async open(config: SQLiteConfig): Promise<void> {
    log('[SQLiteWorkerHandler] open() called with config:', config)
    if (this.adapter) {
      throw new Error('Database already open')
    }
    this.adapter = await createWebSQLiteAdapter(config)
    log('[SQLiteWorkerHandler] open() completed')
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

  async getStorageMode(): Promise<'opfs' | 'memory'> {
    if (!this.adapter) throw new Error('Database not open')
    return this.adapter.getStorageMode()
  }
}

const handler = new SQLiteWorkerHandler()
log('[SQLiteWorker] Handler instance created')

log('[SQLiteWorker] Exposing handler via Comlink...')
Comlink.expose(handler)
log('[SQLiteWorker] Handler exposed - worker ready!')

export type { SQLiteWorkerHandler }
