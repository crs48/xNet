/**
 * SQLite Batch Writer for Electron Data Process
 *
 * Batches multiple SQLite writes into single transactions for better performance.
 * Uses better-sqlite3's transaction() wrapper for atomic batch commits.
 */

import type Database from 'better-sqlite3'

// ─── Types ───────────────────────────────────────────────────────────────────

type WriteOperation =
  | { type: 'blob'; op: 'put'; cid: string; data: Uint8Array }
  | {
      type: 'document'
      op: 'put'
      id: string
      content: Uint8Array
      metadata: string
      version: number
    }
  | { type: 'document'; op: 'delete'; id: string }
  | { type: 'update'; docId: string; updateHash: string; updateData: string }
  | { type: 'snapshot'; docId: string; snapshotData: string }

interface SQLiteBatchOptions {
  /** Maximum operations before auto-flush (default: 100) */
  maxBatchSize?: number
  /** Maximum time in ms before auto-flush (default: 50ms) */
  maxWaitMs?: number
  /** Enable debug logging */
  debug?: boolean
}

// ─── SQLite Batch Writer ─────────────────────────────────────────────────────

/**
 * Batches SQLite write operations and flushes them in a single transaction.
 *
 * This improves write performance by:
 * 1. Reducing WAL sync overhead (one sync per batch instead of per write)
 * 2. Allowing SQLite to optimize multiple writes together
 * 3. Reducing lock contention
 */
export class SQLiteBatchWriter {
  private db: Database.Database
  private pending: WriteOperation[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushPromise: Promise<void> | null = null
  private maxBatchSize: number
  private maxWaitMs: number
  private debug: boolean

  // Prepared statements (lazy initialized)
  private stmts: {
    putBlob?: Database.Statement
    putDocument?: Database.Statement
    deleteDocument?: Database.Statement
    putUpdate?: Database.Statement
    putSnapshot?: Database.Statement
  } = {}

  constructor(db: Database.Database, options: SQLiteBatchOptions = {}) {
    this.db = db
    this.maxBatchSize = options.maxBatchSize ?? 100
    this.maxWaitMs = options.maxWaitMs ?? 50
    this.debug = options.debug ?? false
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[SQLiteBatch]', ...args)
    }
  }

  // ─── Lazy Statement Preparation ────────────────────────────────────────────

  private get putBlobStmt(): Database.Statement {
    if (!this.stmts.putBlob) {
      this.stmts.putBlob = this.db.prepare('INSERT OR REPLACE INTO blobs (cid, data) VALUES (?, ?)')
    }
    return this.stmts.putBlob
  }

  private get putDocumentStmt(): Database.Statement {
    if (!this.stmts.putDocument) {
      this.stmts.putDocument = this.db.prepare(
        'INSERT OR REPLACE INTO documents (id, content, metadata, version) VALUES (?, ?, ?, ?)'
      )
    }
    return this.stmts.putDocument
  }

  private get deleteDocumentStmt(): Database.Statement {
    if (!this.stmts.deleteDocument) {
      this.stmts.deleteDocument = this.db.prepare('DELETE FROM documents WHERE id = ?')
    }
    return this.stmts.deleteDocument
  }

  private get putUpdateStmt(): Database.Statement {
    if (!this.stmts.putUpdate) {
      this.stmts.putUpdate = this.db.prepare(
        'INSERT OR REPLACE INTO updates (doc_id, update_hash, update_data) VALUES (?, ?, ?)'
      )
    }
    return this.stmts.putUpdate
  }

  private get putSnapshotStmt(): Database.Statement {
    if (!this.stmts.putSnapshot) {
      this.stmts.putSnapshot = this.db.prepare(
        'INSERT OR REPLACE INTO snapshots (doc_id, snapshot_data) VALUES (?, ?)'
      )
    }
    return this.stmts.putSnapshot
  }

  // ─── Write Operations ──────────────────────────────────────────────────────

  /**
   * Queue a blob write operation.
   */
  putBlob(cid: string, data: Uint8Array): void {
    // Dedupe by cid
    const existing = this.pending.find((op) => op.type === 'blob' && op.cid === cid)
    if (!existing) {
      this.pending.push({ type: 'blob', op: 'put', cid, data })
      this.scheduleFlush()
    }
  }

  /**
   * Queue a document write operation.
   */
  putDocument(id: string, content: Uint8Array, metadata: string, version: number): void {
    // Remove any pending delete for this id
    this.pending = this.pending.filter(
      (op) => !(op.type === 'document' && op.op === 'delete' && op.id === id)
    )

    // Update or add
    const existing = this.pending.find(
      (op) => op.type === 'document' && op.op === 'put' && op.id === id
    )
    if (existing && existing.type === 'document' && existing.op === 'put') {
      existing.content = content
      existing.metadata = metadata
      existing.version = version
    } else {
      this.pending.push({ type: 'document', op: 'put', id, content, metadata, version })
    }
    this.scheduleFlush()
  }

  /**
   * Queue a document delete operation.
   */
  deleteDocument(id: string): void {
    // Remove any pending put for this id
    this.pending = this.pending.filter(
      (op) => !(op.type === 'document' && op.op === 'put' && op.id === id)
    )
    this.pending.push({ type: 'document', op: 'delete', id })
    this.scheduleFlush()
  }

  /**
   * Queue an update append operation.
   */
  appendUpdate(docId: string, updateHash: string, updateData: string): void {
    // Dedupe by docId + updateHash
    const existing = this.pending.find(
      (op) => op.type === 'update' && op.docId === docId && op.updateHash === updateHash
    )
    if (!existing) {
      this.pending.push({ type: 'update', docId, updateHash, updateData })
      this.scheduleFlush()
    }
  }

  /**
   * Queue a snapshot write operation.
   */
  setSnapshot(docId: string, snapshotData: string): void {
    // Replace any pending snapshot for same doc
    this.pending = this.pending.filter((op) => !(op.type === 'snapshot' && op.docId === docId))
    this.pending.push({ type: 'snapshot', docId, snapshotData })
    this.scheduleFlush()
  }

  // ─── Flush Logic ───────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.pending.length >= this.maxBatchSize) {
      this.flush()
      return
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        this.flush()
      }, this.maxWaitMs)
    }
  }

  /**
   * Flush all pending operations in a single transaction.
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    // Wait for any in-progress flush
    if (this.flushPromise) {
      await this.flushPromise
    }

    if (this.pending.length === 0) {
      return
    }

    const operations = this.pending
    this.pending = []

    this.log('Flushing', operations.length, 'operations')

    // Execute synchronously in transaction (better-sqlite3 is synchronous)
    this.flushPromise = Promise.resolve().then(() => {
      this.executeFlushSync(operations)
    })

    try {
      await this.flushPromise
    } finally {
      this.flushPromise = null
    }
  }

  private executeFlushSync(operations: WriteOperation[]): void {
    // Create a transaction wrapper
    const runBatch = this.db.transaction(() => {
      for (const op of operations) {
        switch (op.type) {
          case 'blob':
            this.putBlobStmt.run(op.cid, Buffer.from(op.data))
            break

          case 'document':
            if (op.op === 'put') {
              this.putDocumentStmt.run(op.id, Buffer.from(op.content), op.metadata, op.version)
            } else {
              this.deleteDocumentStmt.run(op.id)
            }
            break

          case 'update':
            this.putUpdateStmt.run(op.docId, op.updateHash, op.updateData)
            break

          case 'snapshot':
            this.putSnapshotStmt.run(op.docId, op.snapshotData)
            break
        }
      }
    })

    // Execute the transaction
    runBatch()
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  /**
   * Get the number of pending operations
   */
  get pendingCount(): number {
    return this.pending.length
  }

  /**
   * Flush and finalize all statements.
   */
  async close(): Promise<void> {
    await this.flush()
    // Finalize prepared statements
    for (const stmt of Object.values(this.stmts)) {
      if (stmt) {
        // better-sqlite3 doesn't require explicit finalization
        // but we clear the references
      }
    }
    this.stmts = {}
  }
}

/**
 * Create a SQLite batch writer.
 */
export function createSQLiteBatchWriter(
  db: Database.Database,
  options?: SQLiteBatchOptions
): SQLiteBatchWriter {
  return new SQLiteBatchWriter(db, options)
}
