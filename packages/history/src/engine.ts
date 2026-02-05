/**
 * HistoryEngine - Core point-in-time reconstruction
 *
 * Replays changes from the log to reconstruct a node's state at any point
 * in time. Uses snapshot checkpoints for performance and supports multiple
 * targeting strategies (by Lamport time, wall clock, hash, or index).
 */

import type { SnapshotCache } from './snapshot-cache'
import type { HistoryTarget, HistoricalState, TimelineEntry, PropertyDiff } from './types'
import type { DID } from '@xnet/core'
import type {
  NodeChange,
  NodeState,
  NodeStorageAdapter,
  NodeId,
  PropertyTimestamp,
  SchemaIRI
} from '@xnet/data'
import { topologicalSort, compareLamportTimestamps } from '@xnet/sync'
import { deepEqual } from './utils'

export class HistoryEngine {
  constructor(
    private storage: NodeStorageAdapter,
    private snapshots: SnapshotCache
  ) {}

  /** Reconstruct a node's state at a specific point in history */
  async materializeAt(nodeId: NodeId, target: HistoryTarget): Promise<HistoricalState> {
    const allChanges = await this.storage.getChanges(nodeId)
    if (allChanges.length === 0) {
      throw new Error(`No changes found for node ${nodeId}`)
    }

    const sorted = topologicalSort(allChanges)
    const targetIndex = this.resolveTarget(target, sorted)

    if (targetIndex < 0 || targetIndex >= sorted.length) {
      throw new Error(`Target index ${targetIndex} out of range [0, ${sorted.length - 1}]`)
    }

    // Find nearest snapshot before target
    const snapshot = await this.snapshots.getNearestBefore(nodeId, targetIndex)
    let state: NodeState
    let startIndex: number

    if (snapshot) {
      state = structuredClone(snapshot.state)
      startIndex = snapshot.changeIndex + 1
    } else {
      state = createEmptyState(nodeId, sorted[0])
      startIndex = 0
    }

    // Replay changes from startIndex to targetIndex
    for (let i = startIndex; i <= targetIndex; i++) {
      state = applyChangeToState(state, sorted[i])
    }

    // Maybe save a snapshot for future use
    if (this.snapshots.shouldSnapshot(targetIndex)) {
      const existing = await this.snapshots.getNearestBefore(nodeId, targetIndex)
      if (!existing || existing.changeIndex !== targetIndex) {
        await this.snapshots.save(nodeId, targetIndex, sorted[targetIndex].hash, state)
      }
    }

    const targetChange = sorted[targetIndex]
    return {
      node: state,
      target,
      changeIndex: targetIndex,
      totalChanges: sorted.length,
      timestamp: targetChange.wallTime,
      author: targetChange.authorDID,
      changeHash: targetChange.hash
    }
  }

  /** Reconstruct multiple nodes at the same point (for database views) */
  async materializeMultipleAt(
    nodeIds: NodeId[],
    target: HistoryTarget
  ): Promise<Map<NodeId, HistoricalState>> {
    const results = new Map<NodeId, HistoricalState>()
    await Promise.all(
      nodeIds.map(async (id) => {
        try {
          const state = await this.materializeAt(id, target)
          results.set(id, state)
        } catch {
          // Node may not exist at this point — skip
        }
      })
    )
    return results
  }

  /** Get the full timeline for a node */
  async getTimeline(nodeId: NodeId): Promise<TimelineEntry[]> {
    const changes = await this.storage.getChanges(nodeId)
    const sorted = topologicalSort(changes)

    return sorted.map((change, index) => ({
      index,
      change,
      properties: Object.keys(change.payload.properties ?? {}),
      operation: inferOperation(change, index),
      author: change.authorDID,
      wallTime: change.wallTime,
      lamport: change.lamport,
      batchId: change.batchId,
      batchSize: change.batchSize
    }))
  }

  /** Get timeline entries within a range */
  async getTimelineRange(
    nodeId: NodeId,
    from: HistoryTarget,
    to: HistoryTarget
  ): Promise<TimelineEntry[]> {
    const timeline = await this.getTimeline(nodeId)
    const fromIndex = this.resolveTarget(
      from,
      timeline.map((t) => t.change)
    )
    const toIndex = this.resolveTarget(
      to,
      timeline.map((t) => t.change)
    )
    return timeline.slice(fromIndex, toIndex + 1)
  }

  /** Compute diff between two points in time */
  async diff(nodeId: NodeId, from: HistoryTarget, to: HistoryTarget): Promise<PropertyDiff[]> {
    const [stateFrom, stateTo] = await Promise.all([
      this.materializeAt(nodeId, from),
      this.materializeAt(nodeId, to)
    ])

    const diffs: PropertyDiff[] = []
    const allKeys = new Set([
      ...Object.keys(stateFrom.node.properties),
      ...Object.keys(stateTo.node.properties)
    ])

    for (const key of allKeys) {
      const before = stateFrom.node.properties[key]
      const after = stateTo.node.properties[key]

      if (before === undefined && after !== undefined) {
        diffs.push({
          property: key,
          before: undefined,
          after,
          type: 'added',
          changedAt: stateTo.node.timestamps?.[key]?.wallTime ?? stateTo.timestamp,
          changedBy: (stateTo.node.timestamps?.[key]?.lamport?.author ?? stateTo.author) as DID
        })
      } else if (before !== undefined && after === undefined) {
        diffs.push({
          property: key,
          before,
          after: undefined,
          type: 'removed',
          changedAt: stateTo.timestamp,
          changedBy: stateTo.author
        })
      } else if (!deepEqual(before, after)) {
        diffs.push({
          property: key,
          before,
          after,
          type: 'modified',
          changedAt: stateTo.node.timestamps?.[key]?.wallTime ?? stateTo.timestamp,
          changedBy: (stateTo.node.timestamps?.[key]?.lamport?.author ?? stateTo.author) as DID
        })
      }
    }

    return diffs
  }

  /** Create a revert payload (compensating change properties) */
  async createRevertPayload(
    nodeId: NodeId,
    target: HistoryTarget,
    currentState: NodeState
  ): Promise<Record<string, unknown>> {
    const historical = await this.materializeAt(nodeId, target)
    const updates: Record<string, unknown> = {}

    const allKeys = new Set([
      ...Object.keys(currentState.properties),
      ...Object.keys(historical.node.properties)
    ])

    for (const key of allKeys) {
      const current = currentState.properties[key]
      const historicalVal = historical.node.properties[key]
      if (!deepEqual(current, historicalVal)) {
        updates[key] = historicalVal ?? undefined
      }
    }

    return updates
  }

  /** Get the total number of changes for a node */
  async getChangeCount(nodeId: NodeId): Promise<number> {
    const changes = await this.storage.getChanges(nodeId)
    return changes.length
  }

  // ─── Target Resolution ───────────────────────────────────────

  resolveTarget(target: HistoryTarget, sorted: NodeChange[]): number {
    switch (target.type) {
      case 'index':
        return Math.max(0, Math.min(target.index, sorted.length - 1))

      case 'latest':
        return sorted.length - 1

      case 'lamport':
        for (let i = sorted.length - 1; i >= 0; i--) {
          if (sorted[i].lamport.time <= target.time) return i
        }
        return 0

      case 'wall':
        for (let i = sorted.length - 1; i >= 0; i--) {
          if (sorted[i].wallTime <= target.timestamp) return i
        }
        return 0

      case 'hash': {
        const idx = sorted.findIndex((c) => c.hash === target.hash)
        if (idx === -1) throw new Error(`Change hash ${target.hash} not found`)
        return idx
      }

      case 'relative':
        return Math.max(0, Math.min(sorted.length - 1 + target.offset, sorted.length - 1))
    }
  }
}

// ─── Shared Helpers (exported for reuse by ScrubCache etc.) ──

/** Create an empty NodeState for the first change of a node */
export function createEmptyState(nodeId: NodeId, firstChange: NodeChange): NodeState {
  return {
    id: nodeId,
    schemaId: (firstChange.payload.schemaId ?? '') as SchemaIRI,
    properties: {},
    timestamps: {},
    deleted: false,
    createdAt: firstChange.wallTime,
    createdBy: firstChange.authorDID,
    updatedAt: firstChange.wallTime,
    updatedBy: firstChange.authorDID
  }
}

/** Apply a single change to a NodeState (LWW resolution) */
export function applyChangeToState(state: NodeState, change: NodeChange): NodeState {
  const newState: NodeState = {
    ...state,
    properties: { ...state.properties },
    timestamps: { ...state.timestamps }
  }

  for (const [key, value] of Object.entries(change.payload.properties ?? {})) {
    const incoming: PropertyTimestamp = {
      lamport: change.lamport,
      wallTime: change.wallTime
    }
    const existing = newState.timestamps[key]

    if (!existing || compareLamportTimestamps(incoming.lamport, existing.lamport) > 0) {
      if (value === undefined) {
        delete newState.properties[key]
        delete newState.timestamps[key]
      } else {
        newState.properties[key] = value
        newState.timestamps[key] = incoming
      }
    }
  }

  if (change.payload.deleted !== undefined) {
    newState.deleted = change.payload.deleted
    if (change.payload.deleted) {
      newState.deletedAt = { lamport: change.lamport, wallTime: change.wallTime }
    }
  }

  newState.updatedAt = Math.max(newState.updatedAt, change.wallTime)
  newState.updatedBy = change.authorDID

  return newState
}

/** Infer the operation type from a change */
export function inferOperation(change: NodeChange, index: number): TimelineEntry['operation'] {
  if (index === 0) return 'create'
  if (change.payload.deleted === true) return 'delete'
  if (change.payload.deleted === false) return 'restore'
  return 'update'
}
