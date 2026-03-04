/**
 * @xnetjs/sqlite - In-memory SQLite adapter for testing
 *
 * Uses sql.js (SQLite compiled to WASM) for Node.js testing.
 */

import type { SQLiteAdapter, PreparedStatement } from '../adapter'
import type { SQLValue, SQLRow, RunResult, SQLiteConfig } from '../types'
import type { SqlJsDatabase, SqlJsStatic } from 'sql.js'
import { SCHEMA_DDL_CORE, SCHEMA_VERSION } from '../schema'

/**
 * In-memory SQLite adapter using sql.js for testing.
 * This adapter is synchronous but exposes async interface for compatibility.
 *
 * Note: Requires sql.js as a dev dependency for tests.
 */
export class MemorySQLiteAdapter implements SQLiteAdapter {
  private db: SqlJsDatabase | null = null
  private opened = false
  private inTransaction = false

  async open(_config: SQLiteConfig): Promise<void> {
    // Dynamically import sql.js to avoid bundling in production
    const initSqlJs = await import('sql.js').then((m) => m.default)
    const SQL: SqlJsStatic = await initSqlJs()
    this.db = new SQL.Database()
    this.opened = true

    // Apply pragmas - foreign keys enabled by default
    this.db.run('PRAGMA foreign_keys = ON')
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
    this.opened = false
  }

  isOpen(): boolean {
    return this.opened
  }

  async query<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T[]> {
    this.ensureOpen()

    try {
      const stmt = this.db!.prepare(sql)

      if (params && params.length > 0) {
        stmt.bind(params as unknown[])
      }

      const rows: T[] = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T)
      }
      stmt.free()

      return rows
    } catch (err) {
      throw new Error(`Query failed: ${(err as Error).message}\nSQL: ${sql}`)
    }
  }

  async queryOne<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params)
    return rows[0] ?? null
  }

  async run(sql: string, params?: SQLValue[]): Promise<RunResult> {
    this.ensureOpen()

    try {
      const stmt = this.db!.prepare(sql)

      if (params && params.length > 0) {
        stmt.run(params as unknown[])
      } else {
        stmt.run()
      }
      stmt.free()

      // Get last insert rowid
      const lastIdResult = this.db!.exec('SELECT last_insert_rowid() as id')
      const lastId =
        lastIdResult.length > 0 && lastIdResult[0].values.length > 0
          ? BigInt(lastIdResult[0].values[0][0] as number)
          : BigInt(0)

      return {
        changes: this.db!.getRowsModified(),
        lastInsertRowid: lastId
      }
    } catch (err) {
      throw new Error(`Run failed: ${(err as Error).message}\nSQL: ${sql}`)
    }
  }

  async exec(sql: string): Promise<void> {
    this.ensureOpen()

    try {
      this.db!.run(sql)
    } catch (err) {
      throw new Error(`Exec failed: ${(err as Error).message}\nSQL: ${sql}`)
    }
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
    await this.exec('BEGIN TRANSACTION')
    this.inTransaction = true
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress')
    }
    await this.exec('COMMIT')
    this.inTransaction = false
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress')
    }
    await this.exec('ROLLBACK')
    this.inTransaction = false
  }

  async prepare(sql: string): Promise<PreparedStatement> {
    this.ensureOpen()

    // sql.js doesn't have true persistent prepared statements across calls
    // We simulate by re-preparing on each execution
    return {
      query: async <T extends SQLRow = SQLRow>(params?: SQLValue[]) => this.query<T>(sql, params),
      queryOne: async <T extends SQLRow = SQLRow>(params?: SQLValue[]) =>
        this.queryOne<T>(sql, params),
      run: async (params?: SQLValue[]) => this.run(sql, params),
      finalize: async () => {
        // No-op for sql.js
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
    return 0 // In-memory, no file size
  }

  async vacuum(): Promise<void> {
    await this.exec('VACUUM')
  }

  async checkpoint(): Promise<number> {
    return 0 // No WAL in sql.js
  }

  getStorageMode(): 'opfs' | 'memory' {
    return 'memory'
  }

  private ensureOpen(): void {
    if (!this.opened || !this.db) {
      throw new Error('Database not open. Call open() first.')
    }
  }
}

/**
 * Create a MemorySQLiteAdapter with schema applied.
 */
export async function createMemorySQLiteAdapter(): Promise<MemorySQLiteAdapter> {
  const adapter = new MemorySQLiteAdapter()
  await adapter.open({ path: ':memory:' })
  await adapter.applySchema(SCHEMA_VERSION, SCHEMA_DDL_CORE)
  return adapter
}
