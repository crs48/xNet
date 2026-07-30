/**
 * In-memory storage adapter for NodeStore.
 *
 * Useful for testing and ephemeral data.
 */

import type {
  NodeId,
  NodeChange,
  NodeState,
  NodeStorageAdapter,
  ListNodesOptions,
  CountNodesOptions,
  ImportNodesOptions,
  ApplyNodeBatchInput,
  ApplyNodeBatchResult,
  NodeBatchPreflightResult,
  PinEntry,
  PinRegistry
} from './types'
import type { ContentId } from '@xnetjs/core'

type MemoryNodeStorageSnapshot = {
  changes: Map<NodeId, NodeChange[]>
  changesByHash: Map<ContentId, NodeChange>
  nodes: Map<NodeId, NodeState>
  documentContentStore: Map<NodeId, Uint8Array>
  yjsSnapshotStore: {
    nodeId: NodeId
    timestamp: number
    snapshot: Uint8Array
    docState: Uint8Array
    byteSize: number
  }[]
  pinStore: Map<string, Map<string, PinEntry>>
  lastLamportTime: number
}

/**
 * In-memory implementation of NodeStorageAdapter.
 */
export class MemoryNodeStorageAdapter implements NodeStorageAdapter {
  private changes = new Map<NodeId, NodeChange[]>()
  private changesByHash = new Map<ContentId, NodeChange>()
  private nodes = new Map<NodeId, NodeState>()
  private documentContentStore = new Map<NodeId, Uint8Array>()
  private yjsSnapshotStore: {
    nodeId: NodeId
    timestamp: number
    snapshot: Uint8Array
    docState: Uint8Array
    byteSize: number
  }[] = []
  private lastLamportTime = 0
  private syncCursors = new Map<string, number>()

  async withTransaction<T>(fn: (storage: NodeStorageAdapter) => Promise<T>): Promise<T> {
    const snapshot = this.createSnapshot()

    try {
      return await fn(this)
    } catch (err) {
      this.restoreSnapshot(snapshot)
      throw err
    }
  }

  // ==========================================================================
  // Change Log Operations
  // ==========================================================================

  async appendChange(change: NodeChange): Promise<void> {
    this.appendChangeInternal(change)
  }

  async appendChanges(changes: readonly NodeChange[]): Promise<void> {
    changes.forEach((change) => this.appendChangeInternal(change))
  }

  /**
   * Append with hash dedupe — replayed changes must not grow the log
   * (matches the SQLite adapter's `INSERT OR IGNORE`; exploration 0296).
   */
  private appendChangeInternal(change: NodeChange): void {
    if (this.changesByHash.has(change.hash)) return

    const nodeId = change.payload.nodeId
    const existing = this.changes.get(nodeId) ?? []
    existing.push(change)
    this.changes.set(nodeId, existing)
    this.changesByHash.set(change.hash, change)
  }

  async hasChange(hash: ContentId): Promise<boolean> {
    return this.changesByHash.has(hash)
  }

  async getChanges(nodeId: NodeId): Promise<NodeChange[]> {
    return this.changes.get(nodeId) ?? []
  }

  async getAllChanges(): Promise<NodeChange[]> {
    const all: NodeChange[] = []
    for (const changes of this.changes.values()) {
      all.push(...changes)
    }
    // Sort by Lamport time for consistent ordering
    return all.sort((a, b) => a.lamport - b.lamport)
  }

  async getChangesSince(sinceLamport: number): Promise<NodeChange[]> {
    const all = await this.getAllChanges()
    return all.filter((change) => change.lamport > sinceLamport)
  }

  async getChangeByHash(hash: ContentId): Promise<NodeChange | null> {
    return this.changesByHash.get(hash) ?? null
  }

  async getLastChange(nodeId: NodeId): Promise<NodeChange | null> {
    const changes = this.changes.get(nodeId)
    if (!changes || changes.length === 0) return null
    return changes[changes.length - 1]
  }

  async getLastChangesByNodeId(nodeIds: readonly NodeId[]): Promise<Map<NodeId, NodeChange>> {
    const result = new Map<NodeId, NodeChange>()

    Array.from(new Set(nodeIds)).forEach((nodeId) => {
      const changes = this.changes.get(nodeId)
      const lastChange = changes?.at(-1)
      if (lastChange) {
        result.set(nodeId, lastChange)
      }
    })

    return result
  }

  // ==========================================================================
  // Materialized State Operations
  // ==========================================================================

  async getNode(id: NodeId): Promise<NodeState | null> {
    return this.nodes.get(id) ?? null
  }

  async getNodes(ids: readonly NodeId[]): Promise<NodeState[]> {
    const seen = new Set<NodeId>()
    return ids.flatMap((id) => {
      if (seen.has(id)) return []
      seen.add(id)
      const node = this.nodes.get(id)
      return node ? [node] : []
    })
  }

  async getExistingNodeIds(ids: readonly NodeId[]): Promise<NodeId[]> {
    const seen = new Set<NodeId>()
    return ids.filter((id) => {
      if (seen.has(id) || !this.nodes.has(id)) return false
      seen.add(id)
      return true
    })
  }

  async getBatchPreflight(ids: readonly NodeId[]): Promise<NodeBatchPreflightResult> {
    const nodes = await this.getNodes(ids)
    const lastChangesByNodeId = await this.getLastChangesByNodeId(ids)

    return {
      nodesById: new Map(nodes.map((node) => [node.id, node])),
      lastChangesByNodeId
    }
  }

  async setNode(node: NodeState): Promise<void> {
    this.nodes.set(node.id, node)
  }

  async importNodes(nodes: readonly NodeState[], _options?: ImportNodesOptions): Promise<void> {
    nodes.forEach((node) => this.nodes.set(node.id, node))
  }

  async applyNodeBatch(input: ApplyNodeBatchInput): Promise<ApplyNodeBatchResult> {
    input.nodes.forEach((node) => this.nodes.set(node.id, node))
    await this.appendChanges(input.changes)
    this.lastLamportTime = input.lastLamportTime

    return {
      nodeRowsWritten: input.nodes.length,
      propertyRowsWritten: input.nodes.reduce(
        (count, node) => count + Object.keys(node.properties).length,
        0
      ),
      changeRowsWritten: input.changes.length,
      scalarRowsWritten:
        input.indexProperties === false
          ? 0
          : input.nodes.reduce((count, node) => count + Object.keys(node.properties).length, 0),
      ftsRowsWritten: 0
    }
  }

  async deleteNode(id: NodeId): Promise<void> {
    this.nodes.delete(id)
    this.changes.delete(id)
  }

  async listNodes(options?: ListNodesOptions): Promise<NodeState[]> {
    let nodes = Array.from(this.nodes.values())

    // Filter by schema
    if (options?.schemaId) {
      nodes = nodes.filter((n) => n.schemaId === options.schemaId)
    }

    // Filter deleted
    if (!options?.includeDeleted) {
      nodes = nodes.filter((n) => !n.deleted)
    }

    const orderEntries = Object.entries(options?.orderBy ?? {})

    if (orderEntries.length === 0) {
      nodes.sort((a, b) => b.updatedAt - a.updatedAt)
    } else {
      nodes.sort((left, right) => {
        for (const [field, direction] of orderEntries) {
          const leftValue = field === 'createdAt' ? left.createdAt : left.updatedAt
          const rightValue = field === 'createdAt' ? right.createdAt : right.updatedAt
          if (leftValue === rightValue) continue

          const comparison = leftValue < rightValue ? -1 : 1
          return direction === 'asc' ? comparison : -comparison
        }

        return 0
      })
    }

    // Pagination
    const offset = options?.offset ?? 0
    const limit = options?.limit ?? nodes.length

    return nodes.slice(offset, offset + limit)
  }

  async countNodes(options?: CountNodesOptions): Promise<number> {
    let nodes = Array.from(this.nodes.values())

    // Filter by schema
    if (options?.schemaId) {
      nodes = nodes.filter((n) => n.schemaId === options.schemaId)
    }

    // Filter deleted
    if (!options?.includeDeleted) {
      nodes = nodes.filter((n) => !n.deleted)
    }

    return nodes.length
  }

  // ==========================================================================
  // Sync State
  // ==========================================================================

  async getLastLamportTime(): Promise<number> {
    return this.lastLamportTime
  }

  async setLastLamportTime(time: number): Promise<void> {
    this.lastLamportTime = Math.max(this.lastLamportTime, time)
  }

  async getSyncCursor(room: string): Promise<number> {
    return this.syncCursors.get(room) ?? 0
  }

  async setSyncCursor(room: string, lamport: number): Promise<void> {
    this.syncCursors.set(room, Math.max(this.syncCursors.get(room) ?? 0, lamport))
  }

  // ==========================================================================
  // Document Content Operations (for nodes with CRDT document)
  // ==========================================================================

  async getDocumentContent(nodeId: NodeId): Promise<Uint8Array | null> {
    return this.documentContentStore.get(nodeId) ?? null
  }

  async setDocumentContent(nodeId: NodeId, content: Uint8Array): Promise<void> {
    this.documentContentStore.set(nodeId, content)
  }

  // ==========================================================================
  // Yjs Snapshot Operations (for document time travel)
  // ==========================================================================

  async saveYjsSnapshot(snapshot: {
    nodeId: NodeId
    timestamp: number
    snapshot: Uint8Array
    docState: Uint8Array
    byteSize: number
  }): Promise<void> {
    this.yjsSnapshotStore.push(structuredClone(snapshot))
  }

  async getYjsSnapshots(nodeId: NodeId): Promise<
    {
      nodeId: NodeId
      timestamp: number
      snapshot: Uint8Array
      docState: Uint8Array
      byteSize: number
    }[]
  > {
    return this.yjsSnapshotStore
      .filter((s) => s.nodeId === nodeId)
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  async deleteYjsSnapshots(nodeId: NodeId): Promise<void> {
    this.yjsSnapshotStore = this.yjsSnapshotStore.filter((s) => s.nodeId !== nodeId)
  }

  // ==========================================================================
  // Pin Registry (exploration 0329)
  // ==========================================================================

  /** key -> ownerId -> entry */
  private pinStore = new Map<string, Map<string, PinEntry>>()

  readonly pins: PinRegistry = {
    addPins: async (pins: readonly PinEntry[]): Promise<void> => {
      for (const pin of pins) {
        let owners = this.pinStore.get(pin.key)
        if (!owners) {
          owners = new Map()
          this.pinStore.set(pin.key, owners)
        }
        owners.set(pin.ownerId, { ...pin })
      }
    },
    removePinsByOwner: async (ownerId: string): Promise<void> => {
      for (const [key, owners] of this.pinStore) {
        owners.delete(ownerId)
        if (owners.size === 0) this.pinStore.delete(key)
      }
    },
    getPinnedKeysAmong: async (keys: readonly string[]): Promise<Set<string>> => {
      const pinned = new Set<string>()
      for (const key of keys) {
        if (this.pinStore.has(key)) pinned.add(key)
      }
      return pinned
    },
    countPins: async (): Promise<number> => {
      let count = 0
      for (const owners of this.pinStore.values()) count += owners.size
      return count
    }
  }

  // ==========================================================================
  // Utility Methods (for testing)
  // ==========================================================================

  /**
   * Clear all data (for testing).
   */
  clear(): void {
    this.changes.clear()
    this.changesByHash.clear()
    this.nodes.clear()
    this.documentContentStore.clear()
    this.yjsSnapshotStore = []
    this.pinStore.clear()
    this.lastLamportTime = 0
    this.syncCursors.clear()
  }

  /**
   * Get total change count (for testing).
   */
  getChangeCount(): number {
    return this.changesByHash.size
  }

  /**
   * Get total node count (for testing).
   */
  getNodeCount(): number {
    return this.nodes.size
  }

  private createSnapshot(): MemoryNodeStorageSnapshot {
    return {
      changes: new Map(
        Array.from(this.changes.entries(), ([nodeId, changes]) => [
          nodeId,
          structuredClone(changes)
        ])
      ),
      changesByHash: new Map(
        Array.from(this.changesByHash.entries(), ([hash, change]) => [
          hash,
          structuredClone(change)
        ])
      ),
      nodes: new Map(
        Array.from(this.nodes.entries(), ([nodeId, node]) => [nodeId, structuredClone(node)])
      ),
      documentContentStore: new Map(
        Array.from(this.documentContentStore.entries(), ([nodeId, content]) => [
          nodeId,
          new Uint8Array(content)
        ])
      ),
      yjsSnapshotStore: structuredClone(this.yjsSnapshotStore),
      pinStore: new Map(
        Array.from(this.pinStore.entries(), ([key, owners]) => [key, new Map(owners)])
      ),
      lastLamportTime: this.lastLamportTime
    }
  }

  private restoreSnapshot(snapshot: MemoryNodeStorageSnapshot): void {
    this.changes = snapshot.changes
    this.changesByHash = snapshot.changesByHash
    this.nodes = snapshot.nodes
    this.documentContentStore = snapshot.documentContentStore
    this.yjsSnapshotStore = snapshot.yjsSnapshotStore
    this.pinStore = snapshot.pinStore
    this.lastLamportTime = snapshot.lastLamportTime
  }
}
