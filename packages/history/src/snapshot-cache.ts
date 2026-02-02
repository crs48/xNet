/**
 * SnapshotCache - Periodic state checkpoints for fast reconstruction
 *
 * Without snapshots, reconstructing a node with 10,000 changes means
 * replaying all 10,000 from scratch. The SnapshotCache stores periodic
 * checkpoints so reconstruction only replays the remainder.
 */

import type { ContentId } from '@xnet/core'
import type { NodeState, NodeId } from '@xnet/data'
import type { Snapshot, SnapshotCacheOptions, CacheStats } from './types'

// ─── Storage Adapter ─────────────────────────────────────────

export interface SnapshotStorageAdapter {
  saveSnapshot(snapshot: Snapshot): Promise<void>
  getSnapshots(nodeId: NodeId): Promise<Snapshot[]>
  getAllSnapshots(): Promise<Snapshot[]>
  deleteSnapshot(nodeId: NodeId, changeIndex: number): Promise<void>
  deleteSnapshots(nodeId: NodeId): Promise<void>
}

// ─── SnapshotCache ───────────────────────────────────────────

export class SnapshotCache {
  private options: Required<SnapshotCacheOptions>

  constructor(
    private snapshotStorage: SnapshotStorageAdapter,
    options?: Partial<SnapshotCacheOptions>
  ) {
    this.options = {
      interval: options?.interval ?? 100,
      maxPerNode: options?.maxPerNode ?? 50,
      maxTotalBytes: options?.maxTotalBytes ?? 50 * 1024 * 1024
    }
  }

  /** Get the nearest snapshot at or before the target index */
  async getNearestBefore(nodeId: NodeId, changeIndex: number): Promise<Snapshot | null> {
    const snapshots = await this.snapshotStorage.getSnapshots(nodeId)
    let best: Snapshot | null = null
    for (const snap of snapshots) {
      if (snap.changeIndex <= changeIndex) {
        if (!best || snap.changeIndex > best.changeIndex) {
          best = snap
        }
      }
    }
    return best
  }

  /** Save a snapshot */
  async save(
    nodeId: NodeId,
    changeIndex: number,
    changeHash: ContentId,
    state: NodeState
  ): Promise<void> {
    const snapshot: Snapshot = {
      nodeId,
      changeIndex,
      changeHash,
      state: structuredClone(state),
      createdAt: Date.now(),
      byteSize: this.estimateSize(state)
    }

    await this.snapshotStorage.saveSnapshot(snapshot)
    await this.evictIfNeeded(nodeId)
  }

  /** Check if a snapshot should be created at this index */
  shouldSnapshot(changeIndex: number): boolean {
    return changeIndex > 0 && changeIndex % this.options.interval === 0
  }

  /** Delete all snapshots for a node */
  async clear(nodeId: NodeId): Promise<void> {
    await this.snapshotStorage.deleteSnapshots(nodeId)
  }

  /** Get cache stats */
  async getStats(): Promise<CacheStats> {
    const all = await this.snapshotStorage.getAllSnapshots()
    return {
      totalSnapshots: all.length,
      totalBytes: all.reduce((sum, s) => sum + (s.byteSize ?? 0), 0),
      nodeCount: new Set(all.map((s) => s.nodeId)).size
    }
  }

  /** Get the latest snapshot for a node */
  async getLatestSnapshot(nodeId: NodeId): Promise<Snapshot | null> {
    const snapshots = await this.snapshotStorage.getSnapshots(nodeId)
    if (snapshots.length === 0) return null
    return snapshots.reduce((best, snap) => (snap.changeIndex > best.changeIndex ? snap : best))
  }

  // ─── Private ─────────────────────────────────────────────────

  private async evictIfNeeded(nodeId: NodeId): Promise<void> {
    const snapshots = await this.snapshotStorage.getSnapshots(nodeId)

    // Per-node limit: keep most recent N
    if (snapshots.length > this.options.maxPerNode) {
      const sorted = snapshots.sort((a, b) => a.changeIndex - b.changeIndex)
      const toDelete = sorted.slice(0, snapshots.length - this.options.maxPerNode)
      for (const snap of toDelete) {
        await this.snapshotStorage.deleteSnapshot(snap.nodeId, snap.changeIndex)
      }
    }

    // Total size limit
    const stats = await this.getStats()
    if (stats.totalBytes > this.options.maxTotalBytes) {
      const all = await this.snapshotStorage.getAllSnapshots()
      const sorted = all.sort((a, b) => a.createdAt - b.createdAt)
      let totalBytes = stats.totalBytes
      for (const snap of sorted) {
        if (totalBytes <= this.options.maxTotalBytes) break
        await this.snapshotStorage.deleteSnapshot(snap.nodeId, snap.changeIndex)
        totalBytes -= snap.byteSize ?? 0
      }
    }
  }

  private estimateSize(state: NodeState): number {
    return new TextEncoder().encode(JSON.stringify(state)).byteLength
  }
}

// ─── Memory Implementation (for testing) ─────────────────────

export class MemorySnapshotStorage implements SnapshotStorageAdapter {
  private snapshots: Snapshot[] = []

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    // Replace existing snapshot at same nodeId + changeIndex
    const idx = this.snapshots.findIndex(
      (s) => s.nodeId === snapshot.nodeId && s.changeIndex === snapshot.changeIndex
    )
    if (idx >= 0) {
      this.snapshots[idx] = structuredClone(snapshot)
    } else {
      this.snapshots.push(structuredClone(snapshot))
    }
  }

  async getSnapshots(nodeId: NodeId): Promise<Snapshot[]> {
    return this.snapshots.filter((s) => s.nodeId === nodeId)
  }

  async getAllSnapshots(): Promise<Snapshot[]> {
    return [...this.snapshots]
  }

  async deleteSnapshot(nodeId: NodeId, changeIndex: number): Promise<void> {
    this.snapshots = this.snapshots.filter(
      (s) => !(s.nodeId === nodeId && s.changeIndex === changeIndex)
    )
  }

  async deleteSnapshots(nodeId: NodeId): Promise<void> {
    this.snapshots = this.snapshots.filter((s) => s.nodeId !== nodeId)
  }

  /** Clear all snapshots (test helper) */
  clear(): void {
    this.snapshots = []
  }
}
