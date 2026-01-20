/**
 * SQLite storage adapter for Electron
 */
import Database from 'better-sqlite3'
import type { StorageAdapter, DocumentData, DocumentMetadata } from '@xnet/storage'
import type { ContentId, Snapshot, SignedUpdate } from '@xnet/core'

export class SQLiteAdapter implements StorageAdapter {
  private db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
  }

  async open(): Promise<void> {
    this.db.exec(`
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
    this.db.close()
  }

  async clear(): Promise<void> {
    this.db.exec('DELETE FROM documents; DELETE FROM updates; DELETE FROM snapshots; DELETE FROM blobs;')
  }

  async getDocument(id: string): Promise<DocumentData | null> {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as {
      id: string
      content: Buffer
      metadata: string
      version: number
    } | undefined

    if (!row) return null

    return {
      id: row.id,
      content: new Uint8Array(row.content),
      metadata: JSON.parse(row.metadata) as DocumentMetadata,
      version: row.version
    }
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, content, metadata, version)
      VALUES (?, ?, ?, ?)
    `).run(id, Buffer.from(data.content), JSON.stringify(data.metadata), data.version)
  }

  async deleteDocument(id: string): Promise<void> {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
    this.db.prepare('DELETE FROM updates WHERE doc_id = ?').run(id)
    this.db.prepare('DELETE FROM snapshots WHERE doc_id = ?').run(id)
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    const rows = prefix
      ? this.db.prepare('SELECT id FROM documents WHERE id LIKE ?').all(`${prefix}%`)
      : this.db.prepare('SELECT id FROM documents').all()
    return (rows as { id: string }[]).map(r => r.id)
  }

  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    this.db.prepare(`
      INSERT OR IGNORE INTO updates (doc_id, update_hash, update_data)
      VALUES (?, ?, ?)
    `).run(docId, update.updateHash, JSON.stringify(update))
  }

  async getUpdates(docId: string, _since?: string): Promise<SignedUpdate[]> {
    const rows = this.db.prepare(
      'SELECT update_data FROM updates WHERE doc_id = ? ORDER BY created_at ASC'
    ).all(docId) as { update_data: string }[]
    return rows.map(r => JSON.parse(r.update_data) as SignedUpdate)
  }

  async getUpdateCount(docId: string): Promise<number> {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM updates WHERE doc_id = ?'
    ).get(docId) as { count: number }
    return row.count
  }

  async getSnapshot(docId: string): Promise<Snapshot | null> {
    const row = this.db.prepare(
      'SELECT snapshot_data FROM snapshots WHERE doc_id = ?'
    ).get(docId) as { snapshot_data: string } | undefined

    if (!row) return null
    return JSON.parse(row.snapshot_data) as Snapshot
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO snapshots (doc_id, snapshot_data)
      VALUES (?, ?)
    `).run(docId, JSON.stringify(snapshot))
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    const row = this.db.prepare('SELECT data FROM blobs WHERE cid = ?').get(cid) as { data: Buffer } | undefined
    return row ? new Uint8Array(row.data) : null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    this.db.prepare('INSERT OR REPLACE INTO blobs (cid, data) VALUES (?, ?)').run(cid, Buffer.from(data))
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    const row = this.db.prepare('SELECT 1 FROM blobs WHERE cid = ?').get(cid)
    return !!row
  }
}
