/**
 * Expo SQLite Storage Adapter
 *
 * Implements the @xnet/storage StorageAdapter interface using expo-sqlite.
 * This adapter runs SQLite operations on a native thread for better performance.
 */

import type { ContentId, Snapshot, SignedUpdate } from '@xnet/core'
import type { StorageAdapter, DocumentData, DocumentMetadata } from '@xnet/storage'
import * as SQLite from 'expo-sqlite'

// ─── ExpoSQLiteAdapter Class ──────────────────────────────────────────────────

export class ExpoSQLiteAdapter implements StorageAdapter {
  private db: SQLite.SQLiteDatabase | null = null
  private dbName: string
  private initialized = false

  constructor(dbName: string = 'xnet.db') {
    this.dbName = dbName
  }

  // ─── Lifecycle ──────────────────────────────────────────

  async open(): Promise<void> {
    if (this.initialized) return

    this.db = await SQLite.openDatabaseAsync(this.dbName)

    // Create tables
    await this.db.execAsync(`
      -- Documents table stores Y.Doc content and metadata
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        content BLOB NOT NULL,
        metadata TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );

      -- Updates table stores signed Yjs updates for sync
      CREATE TABLE IF NOT EXISTS updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT NOT NULL,
        update_hash TEXT NOT NULL,
        update_data TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(doc_id, update_hash)
      );

      -- Snapshots table stores document snapshots for fast loading
      CREATE TABLE IF NOT EXISTS snapshots (
        doc_id TEXT PRIMARY KEY,
        snapshot_data TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      -- Blobs table stores binary content (images, files)
      CREATE TABLE IF NOT EXISTS blobs (
        cid TEXT PRIMARY KEY,
        data BLOB NOT NULL,
        size INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      -- Indexes for faster queries
      CREATE INDEX IF NOT EXISTS idx_updates_doc_id ON updates(doc_id);
      CREATE INDEX IF NOT EXISTS idx_updates_created ON updates(created_at);
      CREATE INDEX IF NOT EXISTS idx_documents_version ON documents(version);
    `)

    this.initialized = true
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync()
      this.db = null
      this.initialized = false
    }
  }

  async clear(): Promise<void> {
    this.ensureOpen()
    await this.db!.execAsync(`
      DELETE FROM documents;
      DELETE FROM updates;
      DELETE FROM snapshots;
      DELETE FROM blobs;
    `)
  }

  private ensureOpen(): void {
    if (!this.db || !this.initialized) {
      throw new Error('Database not open. Call open() first.')
    }
  }

  // ─── Document Operations ────────────────────────────────

  async getDocument(id: string): Promise<DocumentData | null> {
    this.ensureOpen()

    const result = await this.db!.getFirstAsync<{
      id: string
      content: ArrayBuffer
      metadata: string
      version: number
    }>('SELECT id, content, metadata, version FROM documents WHERE id = ?', [id])

    if (!result) return null

    return {
      id: result.id,
      content: new Uint8Array(result.content),
      metadata: JSON.parse(result.metadata) as DocumentMetadata,
      version: result.version
    }
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    this.ensureOpen()

    await this.db!.runAsync(
      `INSERT INTO documents (id, content, metadata, version)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         content = excluded.content,
         metadata = excluded.metadata,
         version = excluded.version`,
      [id, data.content, JSON.stringify(data.metadata), data.version]
    )
  }

  async deleteDocument(id: string): Promise<void> {
    this.ensureOpen()

    await this.db!.runAsync('DELETE FROM documents WHERE id = ?', [id])
    await this.db!.runAsync('DELETE FROM updates WHERE doc_id = ?', [id])
    await this.db!.runAsync('DELETE FROM snapshots WHERE doc_id = ?', [id])
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    this.ensureOpen()

    let rows: { id: string }[]
    if (prefix) {
      rows = await this.db!.getAllAsync<{ id: string }>(
        'SELECT id FROM documents WHERE id LIKE ?',
        [`${prefix}%`]
      )
    } else {
      rows = await this.db!.getAllAsync<{ id: string }>('SELECT id FROM documents')
    }

    return rows.map((r) => r.id)
  }

  // ─── Update Log ─────────────────────────────────────────

  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    this.ensureOpen()

    await this.db!.runAsync(
      `INSERT INTO updates (doc_id, update_hash, update_data)
       VALUES (?, ?, ?)
       ON CONFLICT(doc_id, update_hash) DO NOTHING`,
      [docId, update.updateHash, JSON.stringify(update)]
    )
  }

  async getUpdates(docId: string, since?: string): Promise<SignedUpdate[]> {
    this.ensureOpen()

    let rows: { update_data: string }[]

    if (since) {
      // Get updates after a specific hash (for incremental sync)
      // First find the ID of the 'since' update
      const sinceResult = await this.db!.getFirstAsync<{ id: number }>(
        'SELECT id FROM updates WHERE doc_id = ? AND update_hash = ?',
        [docId, since]
      )

      if (sinceResult) {
        rows = await this.db!.getAllAsync<{ update_data: string }>(
          'SELECT update_data FROM updates WHERE doc_id = ? AND id > ? ORDER BY id ASC',
          [docId, sinceResult.id]
        )
      } else {
        // If 'since' hash not found, return all updates
        rows = await this.db!.getAllAsync<{ update_data: string }>(
          'SELECT update_data FROM updates WHERE doc_id = ? ORDER BY id ASC',
          [docId]
        )
      }
    } else {
      rows = await this.db!.getAllAsync<{ update_data: string }>(
        'SELECT update_data FROM updates WHERE doc_id = ? ORDER BY id ASC',
        [docId]
      )
    }

    return rows.map((r) => JSON.parse(r.update_data) as SignedUpdate)
  }

  async getUpdateCount(docId: string): Promise<number> {
    this.ensureOpen()

    const result = await this.db!.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM updates WHERE doc_id = ?',
      [docId]
    )

    return result?.count ?? 0
  }

  // ─── Snapshots ──────────────────────────────────────────

  async getSnapshot(docId: string): Promise<Snapshot | null> {
    this.ensureOpen()

    const result = await this.db!.getFirstAsync<{ snapshot_data: string }>(
      'SELECT snapshot_data FROM snapshots WHERE doc_id = ?',
      [docId]
    )

    if (!result) return null
    return JSON.parse(result.snapshot_data) as Snapshot
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    this.ensureOpen()

    await this.db!.runAsync(
      `INSERT INTO snapshots (doc_id, snapshot_data, created_at)
       VALUES (?, ?, strftime('%s', 'now'))
       ON CONFLICT(doc_id) DO UPDATE SET
         snapshot_data = excluded.snapshot_data,
         created_at = excluded.created_at`,
      [docId, JSON.stringify(snapshot)]
    )
  }

  // ─── Blobs ──────────────────────────────────────────────

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    this.ensureOpen()

    const result = await this.db!.getFirstAsync<{ data: ArrayBuffer }>(
      'SELECT data FROM blobs WHERE cid = ?',
      [cid]
    )

    return result ? new Uint8Array(result.data) : null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    this.ensureOpen()

    await this.db!.runAsync(
      `INSERT INTO blobs (cid, data, size)
       VALUES (?, ?, ?)
       ON CONFLICT(cid) DO NOTHING`,
      [cid, data, data.byteLength]
    )
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    this.ensureOpen()

    const result = await this.db!.getFirstAsync<{ exists: number }>(
      'SELECT 1 as exists FROM blobs WHERE cid = ?',
      [cid]
    )

    return !!result
  }

  // ─── Additional Utilities ───────────────────────────────

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
    this.ensureOpen()

    const [docs, updates, snapshots, blobs] = await Promise.all([
      this.db!.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM documents'),
      this.db!.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM updates'),
      this.db!.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM snapshots'),
      this.db!.getFirstAsync<{ count: number; total_size: number }>(
        'SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM blobs'
      )
    ])

    return {
      documentCount: docs?.count ?? 0,
      updateCount: updates?.count ?? 0,
      snapshotCount: snapshots?.count ?? 0,
      blobCount: blobs?.count ?? 0,
      totalBlobSize: blobs?.total_size ?? 0
    }
  }

  /**
   * Vacuum the database to reclaim space.
   */
  async vacuum(): Promise<void> {
    this.ensureOpen()
    await this.db!.execAsync('VACUUM')
  }
}

// ─── Factory Function ─────────────────────────────────────────────────────────

/**
 * Create an ExpoSQLiteAdapter.
 */
export function createExpoSQLiteAdapter(dbName?: string): ExpoSQLiteAdapter {
  return new ExpoSQLiteAdapter(dbName)
}
