/**
 * In-memory storage adapter for NodeStore.
 *
 * Useful for testing and ephemeral data.
 */

import type { ContentId } from '@xnet/core'
import type {
  NodeId,
  NodeChange,
  NodeState,
  NodeStorageAdapter,
  ListNodesOptions,
  CountNodesOptions
} from './types'
import type { SchemaIRI } from '../schema/node'

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

  // ==========================================================================
  // Change Log Operations
  // ==========================================================================

  async appendChange(change: NodeChange): Promise<void> {
    const nodeId = change.payload.nodeId

    // Add to node's change list
    const existing = this.changes.get(nodeId) ?? []
    existing.push(change)
    this.changes.set(nodeId, existing)

    // Index by hash
    this.changesByHash.set(change.hash, change)
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
    return all.sort((a, b) => a.lamport.time - b.lamport.time)
  }

  async getChangesSince(sinceLamport: number): Promise<NodeChange[]> {
    const all = await this.getAllChanges()
    return all.filter((change) => change.lamport.time > sinceLamport)
  }

  async getChangeByHash(hash: ContentId): Promise<NodeChange | null> {
    return this.changesByHash.get(hash) ?? null
  }

  async getLastChange(nodeId: NodeId): Promise<NodeChange | null> {
    const changes = this.changes.get(nodeId)
    if (!changes || changes.length === 0) return null
    return changes[changes.length - 1]
  }

  // ==========================================================================
  // Materialized State Operations
  // ==========================================================================

  async getNode(id: NodeId): Promise<NodeState | null> {
    return this.nodes.get(id) ?? null
  }

  async setNode(node: NodeState): Promise<void> {
    this.nodes.set(node.id, node)
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

    // Sort by creation time (newest first)
    nodes.sort((a, b) => b.createdAt - a.createdAt)

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

  async getYjsSnapshots(
    nodeId: NodeId
  ): Promise<
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
    this.lastLamportTime = 0
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
}
