/**
 * AuditIndex - Queryable change metadata
 *
 * Provides filtering of changes by author, time range, schema, operation,
 * and property. Uses the existing NodeStorageAdapter for data access and
 * provides in-memory filtering.
 */

import type { AuditQuery, AuditEntry, ActivitySummary } from './types'
import type { DID } from '@xnet/core'
import type { NodeChange, NodeStorageAdapter, NodeId, SchemaIRI, NodeStore } from '@xnet/data'

export class AuditIndex {
  constructor(private storage: NodeStorageAdapter) {}

  /** Query changes with full filtering */
  async query(q: AuditQuery): Promise<AuditEntry[]> {
    const changes = await this.getBaseChanges(q)
    const entries = changes.map((change) => this.toAuditEntry(change))
    const filtered = entries.filter((entry) => this.matchesQuery(entry, q))

    // Sort
    const sorted =
      q.order === 'asc'
        ? filtered.sort((a, b) => a.wallTime - b.wallTime)
        : filtered.sort((a, b) => b.wallTime - a.wallTime)

    // Paginate
    const offset = q.offset ?? 0
    const limit = q.limit ?? 100
    return sorted.slice(offset, offset + limit)
  }

  /** Count matching changes */
  async count(q: AuditQuery): Promise<number> {
    const changes = await this.getBaseChanges(q)
    const entries = changes.map((change) => this.toAuditEntry(change))
    return entries.filter((entry) => this.matchesQuery(entry, q)).length
  }

  /** Get activity summary for a node */
  async getNodeActivity(nodeId: NodeId): Promise<ActivitySummary> {
    const changes = await this.storage.getChanges(nodeId)
    return this.summarize(changes)
  }

  /** Get activity summary for a schema */
  async getSchemaActivity(
    schemaIRI: SchemaIRI,
    timeRange?: [number, number]
  ): Promise<ActivitySummary> {
    const allChanges = await this.storage.getAllChanges()
    let changes = allChanges.filter((c) => c.payload.schemaId === schemaIRI)
    if (timeRange) {
      changes = changes.filter((c) => c.wallTime >= timeRange[0] && c.wallTime <= timeRange[1])
    }
    return this.summarize(changes)
  }

  /** Get activity summary for an author */
  async getAuthorActivity(author: DID, timeRange?: [number, number]): Promise<ActivitySummary> {
    const allChanges = await this.storage.getAllChanges()
    let changes = allChanges.filter((c) => c.authorDID === author)
    if (timeRange) {
      changes = changes.filter((c) => c.wallTime >= timeRange[0] && c.wallTime <= timeRange[1])
    }
    return this.summarize(changes)
  }

  /** Get changes since a timestamp */
  async getChangesSince(nodeId: NodeId, since: number): Promise<AuditEntry[]> {
    const changes = await this.storage.getChanges(nodeId)
    return changes
      .filter((c) => c.wallTime >= since)
      .sort((a, b) => a.wallTime - b.wallTime)
      .map((c) => this.toAuditEntry(c))
  }

  /** Subscribe to changes matching a query */
  subscribe(q: AuditQuery, store: NodeStore, callback: (entry: AuditEntry) => void): () => void {
    return store.subscribe((event) => {
      const entry = this.toAuditEntry(event.change)
      if (this.matchesQuery(entry, q)) {
        callback(entry)
      }
    })
  }

  // ─── Private ─────────────────────────────────────────────────

  private async getBaseChanges(q: AuditQuery): Promise<NodeChange[]> {
    if (q.nodeId) {
      return this.storage.getChanges(q.nodeId)
    }
    return this.storage.getAllChanges()
  }

  private toAuditEntry(change: NodeChange): AuditEntry {
    return {
      change,
      operation: this.inferOperation(change),
      author: change.authorDID,
      wallTime: change.wallTime,
      lamport: change.lamport,
      nodeId: change.payload.nodeId,
      schemaIRI: (change.payload.schemaId ?? '') as SchemaIRI,
      properties: Object.keys(change.payload.properties ?? {}),
      batchId: change.batchId,
      batchSize: change.batchSize
    }
  }

  private inferOperation(change: NodeChange): AuditEntry['operation'] {
    if (change.payload.deleted === true) return 'delete'
    if (change.payload.deleted === false) return 'restore'
    if (!change.parentHash) return 'create'
    return 'update'
  }

  private matchesQuery(entry: AuditEntry, q: AuditQuery): boolean {
    if (q.nodeId && entry.nodeId !== q.nodeId) return false
    if (q.nodeIds && !q.nodeIds.includes(entry.nodeId)) return false
    if (q.schemaIRI && entry.schemaIRI !== q.schemaIRI) return false
    if (q.author && entry.author !== q.author) return false
    if (q.authors && !q.authors.includes(entry.author)) return false
    if (q.fromWallTime && entry.wallTime < q.fromWallTime) return false
    if (q.toWallTime && entry.wallTime > q.toWallTime) return false
    if (q.fromLamport && entry.lamport.time < q.fromLamport) return false
    if (q.toLamport && entry.lamport.time > q.toLamport) return false
    if (q.operations && !q.operations.includes(entry.operation)) return false
    if (q.batchId && entry.batchId !== q.batchId) return false
    if (q.properties && !q.properties.some((p) => entry.properties.includes(p))) return false
    return true
  }

  private summarize(changes: NodeChange[]): ActivitySummary {
    const propCounts = new Map<string, number>()
    let creates = 0
    let updates = 0
    let deletes = 0
    let restores = 0

    for (const c of changes) {
      const op = this.inferOperation(c)
      if (op === 'create') creates++
      else if (op === 'update') updates++
      else if (op === 'delete') deletes++
      else if (op === 'restore') restores++

      for (const prop of Object.keys(c.payload.properties ?? {})) {
        propCounts.set(prop, (propCounts.get(prop) ?? 0) + 1)
      }
    }

    const sorted = changes.sort((a, b) => a.wallTime - b.wallTime)

    return {
      totalChanges: changes.length,
      creates,
      updates,
      deletes,
      restores,
      authors: [...new Set(changes.map((c) => c.authorDID))],
      firstChange: sorted[0]?.wallTime ?? 0,
      lastChange: sorted[sorted.length - 1]?.wallTime ?? 0,
      topProperties: [...propCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([property, count]) => ({ property, count }))
    }
  }
}
