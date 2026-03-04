import type { ContentId } from '@xnetjs/core'
import type { StorageAdapter } from '@xnetjs/storage'
import Database from 'better-sqlite3'

export class SQLiteAdapter implements StorageAdapter {
  private db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
  }

  async open(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blobs (
        cid TEXT PRIMARY KEY,
        data BLOB
      );
    `)
  }

  async close(): Promise<void> {
    this.db.close()
  }

  async clear(): Promise<void> {
    this.db.exec('DELETE FROM blobs;')
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    const row = this.db.prepare('SELECT data FROM blobs WHERE cid = ?').get(cid) as
      | { data: Buffer }
      | undefined
    return row ? new Uint8Array(row.data) : null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO blobs (cid, data) VALUES (?, ?)')
      .run(cid, Buffer.from(data))
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    const row = this.db.prepare('SELECT 1 FROM blobs WHERE cid = ?').get(cid)
    return !!row
  }
}
