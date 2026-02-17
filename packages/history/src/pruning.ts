/**
 * PruningEngine - Optional change log pruning for storage recovery
 *
 * Removes old changes behind verified snapshots to reclaim storage.
 * Includes safety checks: sync state, verification, min age, etc.
 */

import type { SnapshotCache } from './snapshot-cache'
import type { PruningPolicy, PruneCandidate, PruneResult, PruneOptions } from './types'
import type { VerificationEngine } from './verification'
import type { NodeChange, NodeStorageAdapter, NodeId, SchemaIRI } from '@xnet/data'
import { topologicalSort } from '@xnet/sync'

/**
 * Duck-typed telemetry interface to avoid circular dependencies.
 */
export interface TelemetryReporter {
  reportPerformance(metricName: string, durationMs: number): void
  reportUsage(metricName: string, count: number): void
}

export const DEFAULT_POLICY: PruningPolicy = {
  keepRecentChanges: 200,
  minAge: 30 * 24 * 60 * 60 * 1000,
  pruneThreshold: 500,
  requireVerifiedSnapshot: true
}

export const MOBILE_POLICY: PruningPolicy = {
  keepRecentChanges: 50,
  minAge: 7 * 24 * 60 * 60 * 1000,
  pruneThreshold: 100,
  requireVerifiedSnapshot: true,
  storageBudget: 50 * 1024 * 1024
}

/** Extended storage adapter with delete support for pruning */
export interface PrunableStorageAdapter extends NodeStorageAdapter {
  deleteChange(hash: string): Promise<void>
}

export class PruningEngine {
  private telemetry?: TelemetryReporter

  constructor(
    private storage: PrunableStorageAdapter,
    private snapshotCache: SnapshotCache,
    private verification: VerificationEngine,
    private policy: PruningPolicy = DEFAULT_POLICY,
    telemetry?: TelemetryReporter
  ) {
    this.telemetry = telemetry
  }

  /** Identify which nodes have prunable changes */
  async findCandidates(): Promise<PruneCandidate[]> {
    const allChanges = await this.storage.getAllChanges()
    const byNode = new Map<NodeId, NodeChange[]>()

    for (const change of allChanges) {
      const nodeId = change.payload.nodeId
      if (!byNode.has(nodeId)) byNode.set(nodeId, [])
      byNode.get(nodeId)!.push(change)
    }

    const candidates: PruneCandidate[] = []
    const now = Date.now()

    for (const [nodeId, changes] of byNode) {
      if (changes.length < this.policy.pruneThreshold) continue

      const schemaId = changes.find((c) => c.payload.schemaId)?.payload.schemaId
      if (schemaId && this.policy.protectedSchemas?.includes(schemaId as SchemaIRI)) continue

      const snapshot = await this.snapshotCache.getLatestSnapshot(nodeId)
      if (!snapshot) continue

      const sorted = topologicalSort(changes)
      const snapshotIdx = snapshot.changeIndex

      if (snapshotIdx <= 0) continue

      const keepFrom = Math.max(snapshotIdx, sorted.length - this.policy.keepRecentChanges)
      const prunableEnd = Math.min(snapshotIdx, keepFrom)
      const prunable = sorted
        .slice(0, prunableEnd)
        .filter((c) => now - c.wallTime > this.policy.minAge)

      if (prunable.length === 0) continue

      candidates.push({
        nodeId,
        totalChanges: changes.length,
        prunableChanges: prunable.length,
        snapshotIndex: snapshotIdx,
        estimatedRecovery: prunable.length * 512
      })
    }

    return candidates.sort((a, b) => b.prunableChanges - a.prunableChanges)
  }

  /** Prune changes for a specific node */
  async pruneNode(nodeId: NodeId, options: PruneOptions = {}): Promise<PruneResult> {
    const start = performance.now()
    const changes = await this.storage.getChanges(nodeId)
    const sorted = topologicalSort(changes)

    const snapshot = await this.snapshotCache.getLatestSnapshot(nodeId)
    if (!snapshot) {
      throw new Error(`Cannot prune ${nodeId}: no snapshot exists`)
    }

    if (this.policy.requireVerifiedSnapshot) {
      const check = await this.verification.quickCheck(nodeId)
      if (!check.valid) {
        throw new Error(
          `Cannot prune ${nodeId}: chain verification failed (${check.errors} errors)`
        )
      }
    }

    const snapshotIdx = snapshot.changeIndex
    const now = Date.now()
    const keepFrom = Math.max(snapshotIdx, sorted.length - this.policy.keepRecentChanges)
    const prunableEnd = Math.min(snapshotIdx, keepFrom)
    const toDelete = sorted
      .slice(0, prunableEnd)
      .filter((c) => now - c.wallTime > this.policy.minAge)

    if (options.dryRun) {
      return {
        nodeId,
        deletedChanges: toDelete.length,
        recoveredBytes: toDelete.length * 512,
        duration: performance.now() - start
      }
    }

    let deleted = 0
    for (let i = 0; i < toDelete.length; i++) {
      if (options.signal?.aborted) break
      await this.storage.deleteChange(toDelete[i].hash)
      deleted++
      options.onProgress?.(i / toDelete.length)
    }

    options.onProgress?.(1)

    const result: PruneResult = {
      nodeId,
      deletedChanges: deleted,
      recoveredBytes: deleted * 512,
      duration: performance.now() - start
    }

    this.telemetry?.reportPerformance('history.pruning', result.duration)
    this.telemetry?.reportUsage('history.pruned_changes', deleted)

    return result
  }

  /** Get storage metrics for a node */
  async getStorageMetrics(nodeId: NodeId): Promise<{
    totalChanges: number
    prunableChanges: number
    estimatedSize: number
    oldestChange: number
    newestChange: number
    hasSnapshot: boolean
  }> {
    const changes = await this.storage.getChanges(nodeId)
    const snapshot = await this.snapshotCache.getLatestSnapshot(nodeId)

    const sorted = changes.sort((a, b) => a.wallTime - b.wallTime)

    let prunableChanges = 0
    if (snapshot) {
      const snapshotIdx = snapshot.changeIndex
      if (snapshotIdx > 0) {
        const now = Date.now()
        prunableChanges = sorted
          .slice(0, snapshotIdx)
          .filter((c) => now - c.wallTime > this.policy.minAge).length
      }
    }

    return {
      totalChanges: changes.length,
      prunableChanges,
      estimatedSize: changes.length * 512,
      oldestChange: sorted[0]?.wallTime ?? 0,
      newestChange: sorted[sorted.length - 1]?.wallTime ?? 0,
      hasSnapshot: !!snapshot
    }
  }
}
