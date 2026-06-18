/**
 * @xnetjs/sqlite - Web SQLite adapter using @sqlite.org/sqlite-wasm
 *
 * Uses the official SQLite WASM package with OPFS for browser-based persistence.
 * Must run in a Web Worker for OPFS access.
 */

import type { SQLiteAdapter, PreparedStatement } from '../adapter'
import type {
  SQLValue,
  SQLRow,
  RunResult,
  SQLiteConfig,
  SQLiteNodeBatchApplyInput,
  SQLiteNodeBatchApplyResult
} from '../types'
import { isSQLiteCorruptionError } from '../errors'
import { SCHEMA_DDL, SCHEMA_VERSION } from '../schema'
import { isOpfsLockError, withOpfsLockRetry } from './opfs-retry'

// We use 'any' types here because @sqlite.org/sqlite-wasm is a peer dependency
// that may not be installed at build time. The actual types are checked at runtime.
/* eslint-disable @typescript-eslint/no-explicit-any */

const WEB_SQLITE_VFS_NAME = 'opfs-sahpool'
const WEB_SQLITE_VFS_DIRECTORY = '.xnet-sqlite'
const WEB_SQLITE_INITIAL_CAPACITY = 10

type OPFSDirectoryHandle = {
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
}

type OPFSStorageManager = {
  getDirectory?: () => Promise<OPFSDirectoryHandle>
}

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

function getDatabasePath(config: SQLiteConfig): string {
  return config.path.startsWith('/') ? config.path : `/${config.path}`
}

async function removeOPFSDirectory(directory: string): Promise<void> {
  const storage = (
    globalThis.navigator as (Navigator & { storage?: OPFSStorageManager }) | undefined
  )?.storage

  if (typeof storage?.getDirectory !== 'function') {
    return
  }

  try {
    const root = await storage.getDirectory()
    await root.removeEntry(directory.replace(/^\/+/, ''), { recursive: true })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      return
    }

    throw err
  }
}

/**
 * Remove xNet's OPFS-backed SQLite storage for the supplied database path.
 *
 * This must run in a worker because the SAH-pool VFS uses synchronous OPFS
 * handles. It is intentionally scoped to xNet's SQLite VFS directory.
 */
export async function resetWebSQLiteOpfsStorage(config: SQLiteConfig): Promise<void> {
  const sqlite3InitModule = (await import('@sqlite.org/sqlite-wasm')).default
  const sqlite3 = await sqlite3InitModule()
  const dbPath = getDatabasePath(config)

  try {
    const poolUtil = await sqlite3.installOpfsSAHPoolVfs({
      name: WEB_SQLITE_VFS_NAME,
      directory: WEB_SQLITE_VFS_DIRECTORY,
      initialCapacity: WEB_SQLITE_INITIAL_CAPACITY,
      clearOnInit: false
    })

    try {
      poolUtil.unlink(dbPath)
    } catch {
      // unlink() can fail if the pool metadata is already damaged. wipeFiles()
      // and the OPFS directory fallback below cover that case.
    }

    await poolUtil.wipeFiles()
    await poolUtil.removeVfs()
  } catch (err) {
    console.warn('[WebSQLiteAdapter] SAH-pool reset failed, removing OPFS directory:', err)
    await removeOPFSDirectory(WEB_SQLITE_VFS_DIRECTORY)
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
    // This is the recommended VFS for single-connection apps.
    //
    // The pool acquires an exclusive sync access handle per file at install
    // time. On a RELOAD the new worker can start before the previous worker
    // releases its handles, so the install throws NoModificationAllowedError.
    // That is transient — retry with a short backoff so we stay on durable
    // OPFS instead of silently dropping to an in-memory database (which made
    // the app appear empty until the hub re-synced; exploration 0204).
    try {
      await withOpfsLockRetry(
        async () => {
          log('[WebSQLiteAdapter] Installing OPFS-SAHPool VFS...')
          this.poolUtil = await this.sqlite3.installOpfsSAHPoolVfs({
            name: WEB_SQLITE_VFS_NAME,
            directory: WEB_SQLITE_VFS_DIRECTORY,
            initialCapacity: WEB_SQLITE_INITIAL_CAPACITY, // Support ~3-4 databases with journals
            clearOnInit: false
          })
          log('[WebSQLiteAdapter] OPFS-SAHPool VFS installed')

          // Ensure we have enough capacity
          log('[WebSQLiteAdapter] Reserving capacity...')
          await this.poolUtil.reserveMinimumCapacity(10)
          log('[WebSQLiteAdapter] Capacity reserved')

          // Path must be absolute for opfs-sahpool
          const dbPath = getDatabasePath(config)

          // Open database using the pool VFS
          log('[WebSQLiteAdapter] Opening database at', dbPath)
          this.db = new this.poolUtil.OpfsSAHPoolDb(dbPath, 'c')
          this.storageMode = 'opfs'
          log('[WebSQLiteAdapter] Database opened with OPFS-SAHPool')
        },
        {
          onRetry: (attempt, retryErr) => {
            console.warn(
              `[WebSQLiteAdapter] OPFS access handles are busy (attempt ${attempt}) — a ` +
                'previous tab/worker is likely still releasing them; retrying before any ' +
                'in-memory fallback.',
              retryErr
            )
          }
        }
      )
    } catch (err) {
      // If OPFS-SAHPool fails, try OPFS direct database before in-memory fallback.
      // Safari can fail SAH pool setup but still support OPFS persistence.
      console.warn('[WebSQLiteAdapter] OPFS-SAHPool not available, trying OPFS direct mode:', err)

      const dbPath = getDatabasePath(config)
      const opfsDbCtor = this.sqlite3?.oo1?.OpfsDb

      if (typeof opfsDbCtor === 'function') {
        try {
          this.db = new opfsDbCtor(dbPath, 'c')
          this.storageMode = 'opfs'
          log('[WebSQLiteAdapter] Database opened with OPFS direct mode')
        } catch (opfsErr) {
          log('[WebSQLiteAdapter] OPFS direct mode not available:', opfsErr)
          this.db = new this.sqlite3.oo1.DB(':memory:', 'c')
          this.storageMode = 'memory'
        }
      } else {
        this.db = new this.sqlite3.oo1.DB(':memory:', 'c')
        this.storageMode = 'memory'
      }

      // An in-memory database is NOT durable: nothing persists across reloads,
      // so the app looks empty on every load and only fills in once the hub
      // re-syncs. This used to be a quiet console.warn buried in noise — make
      // it loud and actionable since it almost always means another open tab/
      // worker is holding the OPFS handles (exploration 0204).
      if (this.storageMode === 'memory') {
        const cause = isOpfsLockError(err)
          ? 'another xNet tab/worker is holding the local database'
          : 'OPFS is unavailable in this browser context'
        console.error(
          `[WebSQLiteAdapter] Using an IN-MEMORY database (${cause}). Local data will NOT ` +
            'persist across reloads and the workspace will appear empty until it re-syncs ' +
            'from the hub. Close other xNet tabs and reload to restore persistent storage.'
        )
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

    // Performance settings — tuned for large (multi-hundred-MB / GB) OPFS
    // databases, see exploration 0184. `page_size` only takes effect on a
    // fresh database (or after a VACUUM), and must be set before any table
    // exists — `applySchema()` runs after `open()`, so this is the right spot.
    // Larger pages mean fewer (synchronous) OPFS reads per index/table scan.
    try {
      this.execSync('PRAGMA page_size = 8192')
    } catch (err) {
      log('[WebSQLiteAdapter] page_size pragma not applied:', err)
    }
    this.execSync('PRAGMA synchronous = NORMAL')
    // 256 MB page cache (negative = KiB). The previous 64 MB could not hold the
    // working set of a 1 GB+ database, so cold reads thrashed OPFS. This is the
    // single biggest documented OPFS speedup.
    this.execSync('PRAGMA cache_size = -262144')
    this.execSync('PRAGMA temp_store = MEMORY')
    // TRUNCATE journaling is the fastest durable mode on OPFS per wa-sqlite
    // benchmarks (faster than both DELETE and WAL). Guard it: some OPFS VFS
    // builds constrain the available journal modes.
    try {
      this.execSync('PRAGMA journal_mode = TRUNCATE')
    } catch (err) {
      log('[WebSQLiteAdapter] journal_mode pragma not applied:', err)
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      // Refresh query-planner statistics on the way out (SQLite-recommended:
      // run `PRAGMA optimize` before closing each connection). Cheap — it only
      // ANALYZEs tables whose row counts drifted — and keeps the next cold
      // start fast as the database grows (exploration 0184).
      try {
        this.execSync('PRAGMA optimize')
      } catch (err) {
        log('[WebSQLiteAdapter] optimize on close skipped:', err)
      }
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

  async applyNodeBatch(input: SQLiteNodeBatchApplyInput): Promise<SQLiteNodeBatchApplyResult> {
    await this.transaction(async () => {
      for (const node of input.nodes) {
        await this.run(
          `INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             schema_id = excluded.schema_id,
             updated_at = excluded.updated_at,
             deleted_at = excluded.deleted_at`,
          [node.id, node.schemaId, node.createdAt, node.updatedAt, node.createdBy, node.deletedAt]
        )

        if (node.propertyKeys.length === 0) {
          await this.run('DELETE FROM node_properties WHERE node_id = ?', [node.id])
        } else {
          await this.run(
            `DELETE FROM node_properties
             WHERE node_id = ? AND property_key NOT IN (${node.propertyKeys.map(() => '?').join(', ')})`,
            [node.id, ...node.propertyKeys]
          )
        }
      }

      for (const property of input.properties) {
        await this.run(
          `INSERT INTO node_properties
              (node_id, property_key, value, lamport_time, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(node_id, property_key) DO UPDATE SET
              value = excluded.value,
              lamport_time = excluded.lamport_time,
              updated_by = excluded.updated_by,
              updated_at = excluded.updated_at
            WHERE excluded.lamport_time > node_properties.lamport_time`,
          [
            property.nodeId,
            property.propertyKey,
            property.value,
            property.lamportTime,
            property.updatedBy,
            property.updatedAt
          ]
        )
      }

      if (input.indexMode !== 'defer-schema') {
        for (const node of input.nodes) {
          await this.run('DELETE FROM node_property_scalars WHERE node_id = ?', [node.id])
        }

        for (const row of input.scalarIndexRows) {
          await this.run(
            `INSERT INTO node_property_scalars
                (
                  node_id,
                  schema_id,
                  property_key,
                  value_type,
                  value_text,
                  value_number,
                  value_boolean,
                  value_hash,
                  updated_at,
                  lamport_time
                )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
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
            ]
          )
        }

        for (const nodeId of input.ftsNodeIds) {
          await this.run('DELETE FROM nodes_fts WHERE node_id = ?', [nodeId])
        }

        for (const row of input.ftsRows) {
          await this.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
            row.nodeId,
            row.title,
            row.content
          ])
        }
      }

      for (const change of input.changes) {
        await this.run(
          `INSERT OR IGNORE INTO changes
            (hash, node_id, payload, lamport_time, lamport_peer, wall_time, author, parent_hash, batch_id, signature)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
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
          ]
        )
      }

      await this.run(
        `INSERT INTO sync_state (key, value) VALUES ('lastLamportTime', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(input.lastLamportTime)]
      )

      if (input.indexMode !== 'defer-schema') {
        const invalidatedAt = Date.now()
        for (const schemaId of input.affectedSchemaIds) {
          await this.run(
            `UPDATE node_query_materializations
             SET invalidated_at = ?
             WHERE schema_id = ? AND invalidated_at IS NULL`,
            [invalidatedAt, schemaId]
          )
        }
      }
    })

    return {
      nodeRowsWritten: input.nodes.length,
      propertyRowsWritten: input.properties.length,
      changeRowsWritten: input.changes.length,
      scalarRowsWritten: input.scalarIndexRows.length,
      ftsRowsWritten: input.ftsRows.length
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

    try {
      this.execSync('COMMIT')
      this.inTransaction = false
    } catch (err) {
      if (isSQLiteCorruptionError(err)) {
        this.inTransaction = false
      }
      throw err
    }
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      return // Silently ignore
    }

    try {
      this.execSync('ROLLBACK')
    } finally {
      this.inTransaction = false
    }
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
