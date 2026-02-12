import type { StorageAdapter, StorageTelemetry } from '../types'
import type { ContentId } from '@xnet/core'
import type { SQLiteAdapter, SQLValue } from '@xnet/sqlite'

interface BlobRow {
  cid: string
  data: Uint8Array
  size: number
  created_at: number
  [key: string]: SQLValue
}

export class SQLiteStorageAdapter implements StorageAdapter {
  private isOpened = false
  private telemetry?: StorageTelemetry

  constructor(
    private db: SQLiteAdapter,
    options?: { telemetry?: StorageTelemetry }
  ) {
    this.telemetry = options?.telemetry
  }

  async open(): Promise<void> {
    if (!this.db.isOpen()) {
      throw new Error('SQLiteAdapter must be opened before use')
    }
    this.isOpened = true
  }

  async close(): Promise<void> {
    this.isOpened = false
  }

  async clear(): Promise<void> {
    this.ensureOpen()
    await this.db.run('DELETE FROM blobs')
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    const start = this.telemetry ? Date.now() : 0
    try {
      this.ensureOpen()
      const row = await this.db.queryOne<BlobRow>('SELECT data FROM blobs WHERE cid = ?', [cid])
      const result = row?.data ?? null

      if (this.telemetry) {
        this.telemetry.reportPerformance('storage.getBlob', Date.now() - start)
        this.telemetry.reportUsage('storage.read', 1)
      }

      return result
    } catch (err) {
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'storage.SQLiteStorageAdapter.getBlob'
      })
      throw err
    }
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    const start = this.telemetry ? Date.now() : 0
    try {
      this.ensureOpen()
      await this.db.run(
        `INSERT OR IGNORE INTO blobs (cid, data, size, created_at)
       VALUES (?, ?, ?, ?)`,
        [cid, data, data.byteLength, Date.now()]
      )

      if (this.telemetry) {
        this.telemetry.reportPerformance('storage.setBlob', Date.now() - start)
        this.telemetry.reportUsage('storage.write', 1)
      }
    } catch (err) {
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'storage.SQLiteStorageAdapter.setBlob'
      })
      throw err
    }
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    const start = this.telemetry ? Date.now() : 0
    try {
      this.ensureOpen()
      const row = await this.db.queryOne<{ found: number; [key: string]: SQLValue }>(
        'SELECT 1 as found FROM blobs WHERE cid = ? LIMIT 1',
        [cid]
      )
      const result = row !== null

      if (this.telemetry) {
        this.telemetry.reportPerformance('storage.hasBlob', Date.now() - start)
      }

      return result
    } catch (err) {
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'storage.SQLiteStorageAdapter.hasBlob'
      })
      throw err
    }
  }

  async deleteBlob(cid: ContentId): Promise<void> {
    this.ensureOpen()
    await this.db.run('DELETE FROM blobs WHERE cid = ?', [cid])
  }

  async getStats(): Promise<{
    blobCount: number
    blobTotalSize: number
  }> {
    this.ensureOpen()
    const blobs = await this.db.queryOne<{ count: number; total: number; [key: string]: SQLValue }>(
      'SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total FROM blobs'
    )
    return {
      blobCount: blobs?.count ?? 0,
      blobTotalSize: blobs?.total ?? 0
    }
  }

  private ensureOpen(): void {
    if (!this.isOpened) {
      throw new Error('StorageAdapter not open. Call open() first.')
    }
  }
}

export function createStorageAdapterFromSQLite(
  sqliteAdapter: SQLiteAdapter,
  options?: { telemetry?: StorageTelemetry }
): SQLiteStorageAdapter {
  return new SQLiteStorageAdapter(sqliteAdapter, options)
}
