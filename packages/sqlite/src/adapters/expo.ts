/**
 * @xnet/sqlite - Expo SQLite adapter using expo-sqlite
 *
 * expo-sqlite runs SQLite on a native thread for performance.
 * All methods are async to match the native API.
 */

import type { SQLiteAdapter, PreparedStatement } from '../adapter'
import type { SQLValue, SQLRow, RunResult, SQLiteConfig } from '../types'
import { SCHEMA_DDL, SCHEMA_VERSION } from '../schema'

// Type definitions for expo-sqlite
interface ExpoSQLiteDatabase {
  getAllAsync<T>(sql: string, params: unknown[]): Promise<T[]>
  getFirstAsync<T>(sql: string, params: unknown[]): Promise<T | null>
  runAsync(sql: string, params: unknown[]): Promise<{ changes: number; lastInsertRowId: number }>
  execAsync(sql: string): Promise<void>
  prepareAsync(sql: string): Promise<ExpoSQLiteStatement>
  closeAsync(): Promise<void>
}

interface ExpoSQLiteStatement {
  executeAsync<T>(params: unknown[]): Promise<ExpoSQLiteResult<T>>
  finalizeAsync(): Promise<void>
}

interface ExpoSQLiteResult<T> {
  getAllAsync(): Promise<T[]>
  getFirstAsync(): Promise<T | null>
}

/**
 * SQLite adapter for Expo/React Native using expo-sqlite.
 *
 * expo-sqlite runs SQLite on a native thread for performance.
 * All methods are async to match the native API.
 *
 * @example
 * ```typescript
 * const adapter = new ExpoSQLiteAdapter()
 * await adapter.open({ path: 'xnet.db' })
 *
 * const nodes = await adapter.query('SELECT * FROM nodes')
 * ```
 */
export class ExpoSQLiteAdapter implements SQLiteAdapter {
  private db: ExpoSQLiteDatabase | null = null
  private config: SQLiteConfig | null = null
  private inTransaction = false

  async open(config: SQLiteConfig): Promise<void> {
    if (this.db) {
      throw new Error('Database already open. Call close() first.')
    }

    // Dynamic import to avoid bundling in web builds
    const SQLite = await import('expo-sqlite')
    this.db = (await SQLite.openDatabaseAsync(config.path)) as unknown as ExpoSQLiteDatabase
    this.config = config

    // Apply pragmas
    if (config.foreignKeys !== false) {
      await this.exec('PRAGMA foreign_keys = ON')
    }

    if (config.busyTimeout) {
      await this.exec(`PRAGMA busy_timeout = ${config.busyTimeout}`)
    } else {
      await this.exec('PRAGMA busy_timeout = 5000')
    }

    // Performance settings
    await this.exec('PRAGMA synchronous = NORMAL')
    await this.exec('PRAGMA cache_size = -32000') // 32MB (smaller for mobile)
    await this.exec('PRAGMA temp_store = MEMORY')

    // WAL mode for mobile
    if (config.walMode !== false) {
      await this.exec('PRAGMA journal_mode = WAL')
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync()
      this.db = null
    }
    this.config = null
  }

  isOpen(): boolean {
    return this.db !== null
  }

  async query<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T[]> {
    this.ensureOpen()

    const result = await this.db!.getAllAsync<T>(sql, (params as unknown[]) ?? [])
    return result
  }

  async queryOne<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T | null> {
    this.ensureOpen()

    const result = await this.db!.getFirstAsync<T>(sql, (params as unknown[]) ?? [])
    return result ?? null
  }

  async run(sql: string, params?: SQLValue[]): Promise<RunResult> {
    this.ensureOpen()

    const result = await this.db!.runAsync(sql, (params as unknown[]) ?? [])

    return {
      changes: result.changes,
      lastInsertRowid: BigInt(result.lastInsertRowId)
    }
  }

  async exec(sql: string): Promise<void> {
    this.ensureOpen()
    await this.db!.execAsync(sql)
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

    await this.exec('BEGIN IMMEDIATE')
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
      return // Silently ignore
    }

    await this.exec('ROLLBACK')
    this.inTransaction = false
  }

  async prepare(sql: string): Promise<PreparedStatement> {
    this.ensureOpen()

    const stmt = await this.db!.prepareAsync(sql)

    return {
      query: async <T extends SQLRow = SQLRow>(params?: SQLValue[]): Promise<T[]> => {
        const result = await stmt.executeAsync<T>((params as unknown[]) ?? [])
        return await result.getAllAsync()
      },
      queryOne: async <T extends SQLRow = SQLRow>(params?: SQLValue[]): Promise<T | null> => {
        const result = await stmt.executeAsync<T>((params as unknown[]) ?? [])
        const first = await result.getFirstAsync()
        return first ?? null
      },
      run: async (params?: SQLValue[]): Promise<RunResult> => {
        await stmt.executeAsync((params as unknown[]) ?? [])
        // expo-sqlite doesn't expose changes/lastInsertRowId from prepared statements
        // We need to query it separately
        const changesRow = await this.db!.getFirstAsync<{ changes: number }>(
          'SELECT changes() as changes',
          []
        )
        const lastIdRow = await this.db!.getFirstAsync<{ id: number }>(
          'SELECT last_insert_rowid() as id',
          []
        )

        return {
          changes: changesRow?.changes ?? 0,
          lastInsertRowid: BigInt(lastIdRow?.id ?? 0)
        }
      },
      finalize: async () => {
        await stmt.finalizeAsync()
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
    try {
      const result = await this.queryOne<{ checkpointed: number }>('PRAGMA wal_checkpoint(PASSIVE)')
      return result?.checkpointed ?? 0
    } catch {
      return 0
    }
  }

  private ensureOpen(): void {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.')
    }
  }

  // ─── Expo-Specific Methods ──────────────────────────────────────────────

  /**
   * Get storage statistics.
   */
  async getStats(): Promise<{
    documentCount: number
    updateCount: number
    snapshotCount: number
    blobCount: number
    totalBlobSize: number
  }> {
    const [nodes, changes, blobs] = await Promise.all([
      this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM nodes'),
      this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM changes'),
      this.queryOne<{ count: number; total_size: number }>(
        'SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM blobs'
      )
    ])

    return {
      documentCount: nodes?.count ?? 0,
      updateCount: changes?.count ?? 0,
      snapshotCount: 0, // Snapshots are derived, not stored separately
      blobCount: blobs?.count ?? 0,
      totalBlobSize: blobs?.total_size ?? 0
    }
  }
}

/**
 * Create an ExpoSQLiteAdapter with schema applied.
 */
export async function createExpoSQLiteAdapter(config: SQLiteConfig): Promise<ExpoSQLiteAdapter> {
  const adapter = new ExpoSQLiteAdapter()
  await adapter.open(config)
  await adapter.applySchema(SCHEMA_VERSION, SCHEMA_DDL)
  return adapter
}
