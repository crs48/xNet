/**
 * SQLite storage adapter for NodeStore.
 *
 * Provides high-performance storage for nodes and changes using SQLite.
 * Works with any SQLiteAdapter implementation (Electron, Web, Expo).
 */

import type {
  NodeId,
  NodeChange,
  NodePayload,
  NodeState,
  NodeStorageAdapter,
  ListNodesOptions,
  CountNodesOptions,
  PropertyTimestamp
} from './types'
import type { SchemaIRI } from '../schema/node'
import type { ContentId, DID } from '@xnet/core'
import type { SQLiteAdapter, SQLValue } from '@xnet/sqlite'

// ─── Row Types ──────────────────────────────────────────────────────────────

interface NodeRow {
  id: string
  schema_id: string
  created_at: number
  updated_at: number
  created_by: string
  deleted_at: number | null
  // Index signature for SQLRow compatibility
  [key: string]: SQLValue
}

interface PropertyRow {
  node_id: string
  property_key: string
  value: Uint8Array | null
  lamport_time: number
  updated_by: string
  updated_at: number
  // Index signature for SQLRow compatibility
  [key: string]: SQLValue
}

interface ChangeRow {
  hash: string
  node_id: string
  payload: Uint8Array
  lamport_time: number
  lamport_author: string
  wall_time: number
  author_did: string
  parent_hash: string | null
  batch_id: string | null
  signature: Uint8Array
  // Index signature for SQLRow compatibility
  [key: string]: SQLValue
}

// ─── SQLiteNodeStorageAdapter ───────────────────────────────────────────────

/**
 * SQLite-backed storage adapter for NodeStore.
 *
 * This adapter provides high-performance storage for nodes and changes
 * using the platform-appropriate SQLite implementation.
 *
 * @example
 * ```typescript
 * import { createMemorySQLiteAdapter } from '@xnet/sqlite/memory'
 *
 * const sqliteAdapter = await createMemorySQLiteAdapter()
 * const nodeStorage = new SQLiteNodeStorageAdapter(sqliteAdapter)
 *
 * const store = new NodeStore({
 *   storage: nodeStorage,
 *   authorDID: identity.did,
 *   signingKey: identity.signingKey
 * })
 * ```
 */
export class SQLiteNodeStorageAdapter implements NodeStorageAdapter {
  constructor(private db: SQLiteAdapter) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async open(): Promise<void> {
    // DB should already be open when passed to constructor
    if (!this.db.isOpen()) {
      throw new Error('SQLiteAdapter must be opened before use')
    }
  }

  async close(): Promise<void> {
    // Don't close the shared SQLiteAdapter - let the owner manage it
  }

  // ─── Change Log Operations ────────────────────────────────────────────────

  async appendChange(change: NodeChange): Promise<void> {
    const payload = this.serializePayload(change.payload)

    // Note: The schema uses 'lamport_peer' and 'author' columns but we adapt here
    // to match Change<T> interface which uses lamport.author and authorDID
    await this.db.run(
      `INSERT OR IGNORE INTO changes 
       (hash, node_id, payload, lamport_time, lamport_peer, wall_time, author, parent_hash, batch_id, signature)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        change.hash,
        change.payload.nodeId,
        payload,
        change.lamport.time,
        change.lamport.author, // lamport.author maps to lamport_peer column
        change.wallTime,
        change.authorDID, // authorDID maps to author column
        change.parentHash ?? null,
        change.batchId ?? null,
        change.signature
      ]
    )
  }

  async getChanges(nodeId: NodeId): Promise<NodeChange[]> {
    const rows = await this.db.query<ChangeRow>(
      `SELECT hash, node_id, payload, lamport_time, 
              lamport_peer as lamport_author, wall_time, 
              author as author_did, parent_hash, batch_id, signature 
       FROM changes WHERE node_id = ? ORDER BY lamport_time ASC`,
      [nodeId]
    )

    return rows.map((row) => this.deserializeChange(row))
  }

  async getAllChanges(): Promise<NodeChange[]> {
    const rows = await this.db.query<ChangeRow>(
      `SELECT hash, node_id, payload, lamport_time, 
              lamport_peer as lamport_author, wall_time, 
              author as author_did, parent_hash, batch_id, signature 
       FROM changes ORDER BY lamport_time ASC`
    )

    return rows.map((row) => this.deserializeChange(row))
  }

  async getChangesSince(sinceLamport: number): Promise<NodeChange[]> {
    const rows = await this.db.query<ChangeRow>(
      `SELECT hash, node_id, payload, lamport_time, 
              lamport_peer as lamport_author, wall_time, 
              author as author_did, parent_hash, batch_id, signature 
       FROM changes WHERE lamport_time > ? ORDER BY lamport_time ASC`,
      [sinceLamport]
    )

    return rows.map((row) => this.deserializeChange(row))
  }

  async getChangeByHash(hash: ContentId): Promise<NodeChange | null> {
    const row = await this.db.queryOne<ChangeRow>(
      `SELECT hash, node_id, payload, lamport_time, 
              lamport_peer as lamport_author, wall_time, 
              author as author_did, parent_hash, batch_id, signature 
       FROM changes WHERE hash = ?`,
      [hash]
    )

    return row ? this.deserializeChange(row) : null
  }

  async getLastChange(nodeId: NodeId): Promise<NodeChange | null> {
    const row = await this.db.queryOne<ChangeRow>(
      `SELECT hash, node_id, payload, lamport_time, 
              lamport_peer as lamport_author, wall_time, 
              author as author_did, parent_hash, batch_id, signature 
       FROM changes WHERE node_id = ? ORDER BY lamport_time DESC LIMIT 1`,
      [nodeId]
    )

    return row ? this.deserializeChange(row) : null
  }

  // ─── Materialized State Operations ────────────────────────────────────────

  async getNode(id: NodeId): Promise<NodeState | null> {
    // Get node metadata
    const nodeRow = await this.db.queryOne<NodeRow>(`SELECT * FROM nodes WHERE id = ?`, [id])

    if (!nodeRow) return null

    // Get properties
    const propRows = await this.db.query<PropertyRow>(
      `SELECT * FROM node_properties WHERE node_id = ?`,
      [id]
    )

    // Build NodeState
    const properties: Record<string, unknown> = {}
    const timestamps: Record<string, PropertyTimestamp> = {}
    let updatedBy: DID = nodeRow.created_by as DID

    for (const prop of propRows) {
      properties[prop.property_key] = this.deserializeValue(prop.value)
      timestamps[prop.property_key] = {
        lamport: { time: prop.lamport_time, author: prop.updated_by as DID },
        wallTime: prop.updated_at
      }
      // Track the most recent updater
      if (prop.updated_at >= nodeRow.updated_at) {
        updatedBy = prop.updated_by as DID
      }
    }

    return {
      id: nodeRow.id,
      schemaId: nodeRow.schema_id as SchemaIRI,
      properties,
      timestamps,
      deleted: nodeRow.deleted_at !== null,
      deletedAt: nodeRow.deleted_at
        ? { lamport: { time: 0, author: '' as DID }, wallTime: nodeRow.deleted_at }
        : undefined,
      createdAt: nodeRow.created_at,
      createdBy: nodeRow.created_by as DID,
      updatedAt: nodeRow.updated_at,
      updatedBy
    }
  }

  async setNode(node: NodeState): Promise<void> {
    // Use manual transaction control for web proxy compatibility
    await this.db.beginTransaction()
    try {
      await this._setNodeInternal(node)
      await this.db.commit()
    } catch (err) {
      await this.db.rollback()
      throw err
    }
  }

  /**
   * Internal method for setting a node without starting a new transaction.
   * Used by importNodes to avoid nested transactions.
   */
  private async _setNodeInternal(node: NodeState): Promise<void> {
    // Upsert node
    await this.db.run(
      `INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         schema_id = excluded.schema_id,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at`,
      [
        node.id,
        node.schemaId,
        node.createdAt,
        node.updatedAt,
        node.createdBy,
        node.deleted && node.deletedAt ? node.deletedAt.wallTime : null
      ]
    )

    // Upsert properties
    for (const [key, value] of Object.entries(node.properties)) {
      const timestamp = node.timestamps[key]
      if (!timestamp) continue

      await this.db.run(
        `INSERT INTO node_properties (node_id, property_key, value, lamport_time, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(node_id, property_key) DO UPDATE SET
           value = excluded.value,
           lamport_time = excluded.lamport_time,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at
         WHERE excluded.lamport_time > node_properties.lamport_time`,
        [
          node.id,
          key,
          this.serializeValue(value),
          timestamp.lamport.time,
          timestamp.lamport.author,
          timestamp.wallTime
        ]
      )
    }
  }

  async deleteNode(id: NodeId): Promise<void> {
    // Delete node (cascades to properties via FK)
    await this.db.run(`DELETE FROM nodes WHERE id = ?`, [id])
  }

  async listNodes(options?: ListNodesOptions): Promise<NodeState[]> {
    let sql = `SELECT id FROM nodes WHERE 1=1`
    const params: unknown[] = []

    if (options?.schemaId) {
      sql += ` AND schema_id = ?`
      params.push(options.schemaId)
    }

    if (!options?.includeDeleted) {
      sql += ` AND deleted_at IS NULL`
    }

    sql += ` ORDER BY updated_at DESC`

    if (options?.limit) {
      sql += ` LIMIT ?`
      params.push(options.limit)
    }

    if (options?.offset) {
      sql += ` OFFSET ?`
      params.push(options.offset)
    }

    const rows = await this.db.query<{ id: string }>(sql, params as never)

    // Batch fetch full node states
    const nodes: NodeState[] = []
    for (const row of rows) {
      const node = await this.getNode(row.id)
      if (node) nodes.push(node)
    }

    return nodes
  }

  async countNodes(options?: CountNodesOptions): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM nodes WHERE 1=1`
    const params: unknown[] = []

    if (options?.schemaId) {
      sql += ` AND schema_id = ?`
      params.push(options.schemaId)
    }

    if (!options?.includeDeleted) {
      sql += ` AND deleted_at IS NULL`
    }

    const row = await this.db.queryOne<{ count: number }>(sql, params as never)
    return row?.count ?? 0
  }

  // ─── Sync State ───────────────────────────────────────────────────────────

  async getLastLamportTime(): Promise<number> {
    const row = await this.db.queryOne<{ value: string }>(
      `SELECT value FROM sync_state WHERE key = 'lastLamportTime'`
    )

    return row ? parseInt(row.value, 10) : 0
  }

  async setLastLamportTime(time: number): Promise<void> {
    await this.db.run(
      `INSERT INTO sync_state (key, value) VALUES ('lastLamportTime', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(time)]
    )
  }

  // ─── Document Content (Yjs) ───────────────────────────────────────────────

  async getDocumentContent(nodeId: NodeId): Promise<Uint8Array | null> {
    const row = await this.db.queryOne<{ state: Uint8Array }>(
      `SELECT state FROM yjs_state WHERE node_id = ?`,
      [nodeId]
    )

    return row?.state ?? null
  }

  async setDocumentContent(nodeId: NodeId, content: Uint8Array): Promise<void> {
    await this.db.run(
      `INSERT INTO yjs_state (node_id, state, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(node_id) DO UPDATE SET
         state = excluded.state,
         updated_at = excluded.updated_at`,
      [nodeId, content, Date.now()]
    )
  }

  // ─── Yjs Snapshots (Extended) ─────────────────────────────────────────────

  /**
   * Save a Yjs snapshot for time travel.
   */
  async saveYjsSnapshot(snapshot: {
    nodeId: NodeId
    timestamp: number
    snapshot: Uint8Array
    docState: Uint8Array
    byteSize: number
  }): Promise<void> {
    await this.db.run(
      `INSERT INTO yjs_snapshots (node_id, timestamp, snapshot, doc_state, byte_size)
       VALUES (?, ?, ?, ?, ?)`,
      [snapshot.nodeId, snapshot.timestamp, snapshot.snapshot, snapshot.docState, snapshot.byteSize]
    )
  }

  /**
   * Get Yjs snapshots for a node.
   */
  async getYjsSnapshots(nodeId: NodeId): Promise<
    Array<{
      nodeId: NodeId
      timestamp: number
      snapshot: Uint8Array
      docState: Uint8Array
      byteSize: number
    }>
  > {
    const rows = await this.db.query<{
      node_id: string
      timestamp: number
      snapshot: Uint8Array
      doc_state: Uint8Array
      byte_size: number
    }>(`SELECT * FROM yjs_snapshots WHERE node_id = ? ORDER BY timestamp ASC`, [nodeId])

    return rows.map((row) => ({
      nodeId: row.node_id,
      timestamp: row.timestamp,
      snapshot: row.snapshot,
      docState: row.doc_state,
      byteSize: row.byte_size
    }))
  }

  /**
   * Delete Yjs snapshots for a node.
   */
  async deleteYjsSnapshots(nodeId: NodeId): Promise<void> {
    await this.db.run(`DELETE FROM yjs_snapshots WHERE node_id = ?`, [nodeId])
  }

  // ─── Bulk Operations ──────────────────────────────────────────────────────

  /**
   * Import multiple nodes in a single transaction.
   * Used for sync and restore operations.
   */
  async importNodes(nodes: NodeState[]): Promise<void> {
    // Use manual transaction control for web proxy compatibility
    await this.db.beginTransaction()
    try {
      for (const node of nodes) {
        await this._setNodeInternal(node)
      }
      await this.db.commit()
    } catch (err) {
      await this.db.rollback()
      throw err
    }
  }

  /**
   * Import multiple changes in a single transaction.
   */
  async importChanges(changes: NodeChange[]): Promise<void> {
    // Use manual transaction control for web proxy compatibility
    await this.db.beginTransaction()
    try {
      for (const change of changes) {
        await this.appendChange(change)
      }
      await this.db.commit()
    } catch (err) {
      await this.db.rollback()
      throw err
    }
  }

  /**
   * Clear all data (for testing or reset).
   */
  async clear(): Promise<void> {
    // Use manual transaction control for web proxy compatibility
    await this.db.beginTransaction()
    try {
      await this.db.run('DELETE FROM yjs_snapshots')
      await this.db.run('DELETE FROM yjs_updates')
      await this.db.run('DELETE FROM yjs_state')
      await this.db.run('DELETE FROM changes')
      await this.db.run('DELETE FROM node_properties')
      await this.db.run('DELETE FROM nodes')
      await this.db.run("DELETE FROM sync_state WHERE key = 'lastLamportTime'")
      await this.db.commit()
    } catch (err) {
      await this.db.rollback()
      throw err
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private serializePayload(payload: NodePayload): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(payload))
  }

  private deserializePayload(data: Uint8Array): NodePayload {
    return JSON.parse(new TextDecoder().decode(data))
  }

  private serializeValue(value: unknown): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(value))
  }

  private deserializeValue(data: Uint8Array | null): unknown {
    if (!data) return null
    return JSON.parse(new TextDecoder().decode(data))
  }

  private deserializeChange(row: ChangeRow): NodeChange {
    // Note: Need to provide required fields for Change<T>
    // The id, type, protocolVersion fields need to be included
    const payload = this.deserializePayload(row.payload)

    return {
      // Required Change<T> fields
      id: row.hash, // Use hash as ID since we don't store separate id
      type: 'node', // All node changes have type 'node'
      hash: row.hash as ContentId,
      payload,
      lamport: { time: row.lamport_time, author: row.lamport_author as DID },
      wallTime: row.wall_time,
      authorDID: row.author_did as DID,
      parentHash: (row.parent_hash as ContentId) ?? null,
      batchId: row.batch_id ?? undefined,
      signature: row.signature
    }
  }
}
