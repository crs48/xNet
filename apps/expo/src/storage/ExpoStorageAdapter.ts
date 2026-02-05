/**
 * Expo SQLite storage adapter
 */
import type {
  StorageAdapter,
  DocumentData,
  DocumentMetadata,
  ContentId,
  Snapshot,
  SignedUpdate
} from '@xnet/sdk'
import * as SQLite from 'expo-sqlite'

export class ExpoStorageAdapter implements StorageAdapter {
  private db: SQLite.SQLiteDatabase | null = null
  private dbName: string

  constructor(dbName: string = 'xnet.db') {
    this.dbName = dbName
  }

  async open(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync(this.dbName)

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        content BLOB,
        metadata TEXT,
        version INTEGER
      );

      CREATE TABLE IF NOT EXISTS updates (
        doc_id TEXT,
        update_hash TEXT,
        update_data TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (doc_id, update_hash)
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        doc_id TEXT PRIMARY KEY,
        snapshot_data TEXT
      );

      CREATE TABLE IF NOT EXISTS blobs (
        cid TEXT PRIMARY KEY,
        data BLOB
      );

      CREATE INDEX IF NOT EXISTS idx_updates_doc ON updates(doc_id);
    `)
  }

  async close(): Promise<void> {
    await this.db?.closeAsync()
    this.db = null
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.execAsync(`
      DELETE FROM documents;
      DELETE FROM updates;
      DELETE FROM snapshots;
      DELETE FROM blobs;
    `)
  }

  async getDocument(id: string): Promise<DocumentData | null> {
    if (!this.db) throw new Error('Database not open')
    const result = await this.db.getFirstAsync<{
      id: string
      content: ArrayBuffer
      metadata: string
      version: number
    }>('SELECT * FROM documents WHERE id = ?', [id])

    if (!result) return null

    return {
      id: result.id,
      content: new Uint8Array(result.content),
      metadata: JSON.parse(result.metadata) as DocumentMetadata,
      version: result.version
    }
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.runAsync(
      `INSERT OR REPLACE INTO documents (id, content, metadata, version) VALUES (?, ?, ?, ?)`,
      [id, data.content, JSON.stringify(data.metadata), data.version]
    )
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.runAsync('DELETE FROM documents WHERE id = ?', [id])
    await this.db.runAsync('DELETE FROM updates WHERE doc_id = ?', [id])
    await this.db.runAsync('DELETE FROM snapshots WHERE doc_id = ?', [id])
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not open')
    const rows = prefix
      ? await this.db.getAllAsync<{ id: string }>('SELECT id FROM documents WHERE id LIKE ?', [
          `${prefix}%`
        ])
      : await this.db.getAllAsync<{ id: string }>('SELECT id FROM documents')
    return rows.map((r) => r.id)
  }

  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.runAsync(
      'INSERT OR IGNORE INTO updates (doc_id, update_hash, update_data) VALUES (?, ?, ?)',
      [docId, update.updateHash, JSON.stringify(update)]
    )
  }

  async getUpdates(docId: string, _since?: string): Promise<SignedUpdate[]> {
    if (!this.db) throw new Error('Database not open')
    const rows = await this.db.getAllAsync<{ update_data: string }>(
      'SELECT update_data FROM updates WHERE doc_id = ? ORDER BY created_at ASC',
      [docId]
    )
    return rows.map((r) => JSON.parse(r.update_data) as SignedUpdate)
  }

  async getUpdateCount(docId: string): Promise<number> {
    if (!this.db) throw new Error('Database not open')
    const result = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM updates WHERE doc_id = ?',
      [docId]
    )
    return result?.count ?? 0
  }

  async getSnapshot(docId: string): Promise<Snapshot | null> {
    if (!this.db) throw new Error('Database not open')
    const result = await this.db.getFirstAsync<{ snapshot_data: string }>(
      'SELECT snapshot_data FROM snapshots WHERE doc_id = ?',
      [docId]
    )
    if (!result) return null
    return JSON.parse(result.snapshot_data) as Snapshot
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.runAsync(
      'INSERT OR REPLACE INTO snapshots (doc_id, snapshot_data) VALUES (?, ?)',
      [docId, JSON.stringify(snapshot)]
    )
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    if (!this.db) throw new Error('Database not open')
    const result = await this.db.getFirstAsync<{ data: ArrayBuffer }>(
      'SELECT data FROM blobs WHERE cid = ?',
      [cid]
    )
    return result ? new Uint8Array(result.data) : null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.runAsync('INSERT OR REPLACE INTO blobs (cid, data) VALUES (?, ?)', [cid, data])
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    if (!this.db) throw new Error('Database not open')
    const result = await this.db.getFirstAsync<{ exists: number }>(
      'SELECT 1 as exists FROM blobs WHERE cid = ?',
      [cid]
    )
    return !!result
  }
}
