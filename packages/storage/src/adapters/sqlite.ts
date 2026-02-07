/**
 * SQLite storage adapter for @xnet/storage
 *
 * Uses the unified SQLiteAdapter from @xnet/sqlite for cross-platform storage.
 */

import type { StorageAdapter, DocumentData, DocumentMetadata } from '../types'
import type { ContentId, Snapshot, SignedUpdate } from '@xnet/core'
import type { SQLiteAdapter, SQLValue } from '@xnet/sqlite'

// ─── Row Types ──────────────────────────────────────────────────────────────

interface DocumentRow {
  id: string
  content: Uint8Array
  metadata: string
  version: number
  [key: string]: SQLValue
}

interface UpdateRow {
  id: number
  doc_id: string
  update_hash: string
  update_data: string
  created_at: number
  [key: string]: SQLValue
}

interface SnapshotRow {
  doc_id: string
  snapshot_data: string
  created_at: number
  [key: string]: SQLValue
}

interface BlobRow {
  cid: string
  data: Uint8Array
  size: number
  created_at: number
  [key: string]: SQLValue
}

// ─── SQLiteStorageAdapter ───────────────────────────────────────────────────

/**
 * SQLite-backed storage adapter.
 *
 * Uses the platform-appropriate SQLite implementation via SQLiteAdapter.
 * Provides document storage, update logs, snapshots, and blob storage.
 *
 * @example
 * ```typescript
 * import { createMemorySQLiteAdapter } from '@xnet/sqlite/memory'
 *
 * const sqliteAdapter = await createMemorySQLiteAdapter()
 * const storage = new SQLiteStorageAdapter(sqliteAdapter)
 * await storage.open()
 * ```
 */
export class SQLiteStorageAdapter implements StorageAdapter {
  private isOpened = false

  constructor(private db: SQLiteAdapter) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async open(): Promise<void> {
    if (!this.db.isOpen()) {
      throw new Error('SQLiteAdapter must be opened before use')
    }
    this.isOpened = true
  }

  async close(): Promise<void> {
    // Don't close the shared SQLiteAdapter - let the owner manage it
    this.isOpened = false
  }

  async clear(): Promise<void> {
    this.ensureOpen()

    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM updates')
      await this.db.run('DELETE FROM snapshots')
      await this.db.run('DELETE FROM documents')
      await this.db.run('DELETE FROM blobs')
    })
  }

  // ─── Document Operations ──────────────────────────────────────────────────

  async getDocument(id: string): Promise<DocumentData | null> {
    this.ensureOpen()

    const row = await this.db.queryOne<DocumentRow>('SELECT * FROM documents WHERE id = ?', [id])

    if (!row) return null

    return {
      id: row.id,
      content: row.content,
      metadata: JSON.parse(row.metadata) as DocumentMetadata,
      version: row.version
    }
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    this.ensureOpen()

    await this.db.run(
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

    await this.db.transaction(async () => {
      // Delete related updates and snapshots
      await this.db.run('DELETE FROM updates WHERE doc_id = ?', [id])
      await this.db.run('DELETE FROM snapshots WHERE doc_id = ?', [id])
      // Delete document
      await this.db.run('DELETE FROM documents WHERE id = ?', [id])
    })
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    this.ensureOpen()

    let sql = 'SELECT id FROM documents'
    const params: string[] = []

    if (prefix) {
      sql += " WHERE id LIKE ? ESCAPE '\\'"
      params.push(`${this.escapeLike(prefix)}%`)
    }

    sql += ' ORDER BY id'

    interface IdRow {
      id: string
      [key: string]: SQLValue
    }
    const rows = await this.db.query<IdRow>(sql, params)

    return rows.map((row: IdRow) => row.id)
  }

  // ─── Update Log ───────────────────────────────────────────────────────────

  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    this.ensureOpen()

    // Serialize the update
    const updateData = JSON.stringify({
      update: this.encodeBase64(update.update),
      parentHash: update.parentHash,
      updateHash: update.updateHash,
      authorDID: update.authorDID,
      signature: this.encodeBase64(update.signature),
      timestamp: update.timestamp,
      vectorClock: update.vectorClock
    })

    await this.db.run(
      `INSERT OR IGNORE INTO updates (doc_id, update_hash, update_data, created_at)
       VALUES (?, ?, ?, ?)`,
      [docId, update.updateHash, updateData, Date.now()]
    )
  }

  async getUpdates(docId: string, since?: string): Promise<SignedUpdate[]> {
    this.ensureOpen()

    let sql = 'SELECT * FROM updates WHERE doc_id = ?'
    const params: (string | number)[] = [docId]

    if (since !== undefined) {
      // Get updates after a specific update hash
      sql += ' AND id > (SELECT id FROM updates WHERE update_hash = ? LIMIT 1)'
      params.push(since)
    }

    sql += ' ORDER BY id ASC'

    const rows = await this.db.query<UpdateRow>(sql, params)

    return rows.map((row) => this.deserializeUpdate(row.update_data))
  }

  async getUpdateCount(docId: string): Promise<number> {
    this.ensureOpen()

    const row = await this.db.queryOne<{ count: number; [key: string]: SQLValue }>(
      'SELECT COUNT(*) as count FROM updates WHERE doc_id = ?',
      [docId]
    )

    return row?.count ?? 0
  }

  // ─── Snapshots ────────────────────────────────────────────────────────────

  async getSnapshot(docId: string): Promise<Snapshot | null> {
    this.ensureOpen()

    const row = await this.db.queryOne<SnapshotRow>('SELECT * FROM snapshots WHERE doc_id = ?', [
      docId
    ])

    if (!row) return null

    return this.deserializeSnapshot(row.snapshot_data)
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    this.ensureOpen()

    const snapshotData = JSON.stringify({
      id: snapshot.id,
      documentId: snapshot.documentId,
      stateVector: this.encodeBase64(snapshot.stateVector),
      compressedState: this.encodeBase64(snapshot.compressedState),
      timestamp: snapshot.timestamp,
      creatorDID: snapshot.creatorDID,
      signature: this.encodeBase64(snapshot.signature),
      contentId: snapshot.contentId
    })

    await this.db.run(
      `INSERT INTO snapshots (doc_id, snapshot_data, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(doc_id) DO UPDATE SET
         snapshot_data = excluded.snapshot_data,
         created_at = excluded.created_at`,
      [docId, snapshotData, Date.now()]
    )
  }

  // ─── Blobs ────────────────────────────────────────────────────────────────

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    this.ensureOpen()

    const row = await this.db.queryOne<BlobRow>('SELECT data FROM blobs WHERE cid = ?', [cid])

    return row?.data ?? null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    this.ensureOpen()

    await this.db.run(
      `INSERT OR IGNORE INTO blobs (cid, data, size, created_at)
       VALUES (?, ?, ?, ?)`,
      [cid, data, data.byteLength, Date.now()]
    )
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    this.ensureOpen()

    const row = await this.db.queryOne<{ found: number; [key: string]: SQLValue }>(
      'SELECT 1 as found FROM blobs WHERE cid = ? LIMIT 1',
      [cid]
    )

    return row !== null
  }

  // ─── Extended Methods ─────────────────────────────────────────────────────

  /**
   * Delete a blob by CID.
   * Not in base interface but useful for cleanup.
   */
  async deleteBlob(cid: ContentId): Promise<void> {
    this.ensureOpen()
    await this.db.run('DELETE FROM blobs WHERE cid = ?', [cid])
  }

  /**
   * Get storage statistics.
   */
  async getStats(): Promise<{
    documentCount: number
    blobCount: number
    blobTotalSize: number
    updateCount: number
    snapshotCount: number
  }> {
    this.ensureOpen()

    const [docs, blobs, updates, snapshots] = await Promise.all([
      this.db.queryOne<{ count: number; [key: string]: SQLValue }>(
        'SELECT COUNT(*) as count FROM documents'
      ),
      this.db.queryOne<{ count: number; total: number; [key: string]: SQLValue }>(
        'SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total FROM blobs'
      ),
      this.db.queryOne<{ count: number; [key: string]: SQLValue }>(
        'SELECT COUNT(*) as count FROM updates'
      ),
      this.db.queryOne<{ count: number; [key: string]: SQLValue }>(
        'SELECT COUNT(*) as count FROM snapshots'
      )
    ])

    return {
      documentCount: docs?.count ?? 0,
      blobCount: blobs?.count ?? 0,
      blobTotalSize: blobs?.total ?? 0,
      updateCount: updates?.count ?? 0,
      snapshotCount: snapshots?.count ?? 0
    }
  }

  /**
   * Compact updates by merging into snapshot.
   */
  async compactUpdates(docId: string, mergedSnapshot: Snapshot): Promise<number> {
    this.ensureOpen()

    let deletedCount = 0

    await this.db.transaction(async () => {
      // Set new snapshot
      await this.setSnapshot(docId, mergedSnapshot)

      // Delete old updates
      const result = await this.db.run('DELETE FROM updates WHERE doc_id = ?', [docId])
      deletedCount = result.changes
    })

    return deletedCount
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private ensureOpen(): void {
    if (!this.isOpened) {
      throw new Error('StorageAdapter not open. Call open() first.')
    }
  }

  private escapeLike(value: string): string {
    return value.replace(/[%_\\]/g, '\\$&')
  }

  private encodeBase64(data: Uint8Array): string {
    // Use browser/node compatible method
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(data).toString('base64')
    }
    return btoa(String.fromCharCode(...data))
  }

  private decodeBase64(str: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(str, 'base64'))
    }
    return new Uint8Array(
      atob(str)
        .split('')
        .map((c) => c.charCodeAt(0))
    )
  }

  private deserializeUpdate(data: string): SignedUpdate {
    const parsed = JSON.parse(data) as {
      update: string
      parentHash: string
      updateHash: string
      authorDID: string
      signature: string
      timestamp: number
      vectorClock: Record<string, number>
    }

    return {
      update: this.decodeBase64(parsed.update),
      parentHash: parsed.parentHash,
      updateHash: parsed.updateHash,
      authorDID: parsed.authorDID,
      signature: this.decodeBase64(parsed.signature),
      timestamp: parsed.timestamp,
      vectorClock: parsed.vectorClock
    }
  }

  private deserializeSnapshot(data: string): Snapshot {
    const parsed = JSON.parse(data) as {
      id: string
      documentId: string
      stateVector: string
      compressedState: string
      timestamp: number
      creatorDID: string
      signature: string
      contentId: string
    }

    return {
      id: parsed.id,
      documentId: parsed.documentId,
      stateVector: this.decodeBase64(parsed.stateVector),
      compressedState: this.decodeBase64(parsed.compressedState),
      timestamp: parsed.timestamp,
      creatorDID: parsed.creatorDID,
      signature: this.decodeBase64(parsed.signature),
      contentId: parsed.contentId as ContentId
    }
  }
}

// ─── Factory Functions ──────────────────────────────────────────────────────

/**
 * Create SQLiteStorageAdapter from an existing SQLiteAdapter.
 * Use when sharing the SQLite connection with other services.
 */
export function createStorageAdapterFromSQLite(sqliteAdapter: SQLiteAdapter): SQLiteStorageAdapter {
  return new SQLiteStorageAdapter(sqliteAdapter)
}
