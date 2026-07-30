/**
 * ScopeTimeline — merged multi-node timeline over an *arbitrary* node set
 * (exploration 0329). Generalizes SchemaTimeline's "all nodes of a schema"
 * to any membership: a workspace, a page plus its comment threads, a
 * database, a draft's members. `SchemaTimeline` now delegates here.
 *
 * The merged Lamport line is the scrub axis: one integer position drives the
 * `PlaybackEngine` transport, and any position converts to a hash-anchored
 * `Frontier` for checkpointing or forking.
 */

import type { Frontier } from './frontier'
import type { SchemaTimelineEntry, TimelineEntry } from './types'
import type { NodeChange, NodeId, NodeState, NodeStorageAdapter } from '@xnetjs/data'
import { topologicalSort } from '@xnetjs/sync'
import { createEmptyState, applyChangeToState } from './engine'

/** One entry in a scope timeline (same shape the schema timeline uses). */
export type ScopeTimelineEntry = SchemaTimelineEntry

export class ScopeTimeline {
  constructor(private storage: NodeStorageAdapter) {}

  /** Merge the change logs of an explicit node set into one Lamport-ordered line. */
  async getMergedTimeline(nodeIds: readonly NodeId[]): Promise<ScopeTimelineEntry[]> {
    if (nodeIds.length === 0) return []

    const allChanges: { change: NodeChange; nodeId: NodeId }[] = []
    await Promise.all(
      nodeIds.map(async (nodeId) => {
        const changes = await this.storage.getChanges(nodeId)
        for (const change of changes) {
          allChanges.push({ change, nodeId })
        }
      })
    )

    if (allChanges.length === 0) return []

    // Lamport order (global causal order), authorDID tiebreak.
    allChanges.sort(
      (a, b) =>
        a.change.lamport - b.change.lamport ||
        // UTF-16 code-unit order (not localeCompare) for deterministic convergence.
        (a.change.authorDID < b.change.authorDID
          ? -1
          : a.change.authorDID > b.change.authorDID
            ? 1
            : 0)
    )

    const nodeChangeCount = new Map<NodeId, number>()
    return allChanges.map(({ change, nodeId }, index) => {
      const count = nodeChangeCount.get(nodeId) ?? 0
      nodeChangeCount.set(nodeId, count + 1)

      return {
        index,
        change,
        nodeId,
        properties: Object.keys(change.payload.properties ?? {}),
        operation: inferScopeOperation(change, count),
        author: change.authorDID,
        wallTime: change.wallTime,
        lamport: change.lamport,
        batchId: change.batchId,
        batchSize: change.batchSize
      }
    })
  }

  /** Reconstruct every member's live state at a timeline position. */
  async materializeScopeAt(
    timeline: readonly ScopeTimelineEntry[],
    targetIndex: number
  ): Promise<NodeState[]> {
    if (timeline.length === 0 || targetIndex < 0 || targetIndex >= timeline.length) return []

    const changesByNode = new Map<NodeId, NodeChange[]>()
    for (let i = 0; i <= targetIndex; i++) {
      const entry = timeline[i]
      if (!changesByNode.has(entry.nodeId)) {
        changesByNode.set(entry.nodeId, [])
      }
      changesByNode.get(entry.nodeId)!.push(entry.change)
    }

    const results: NodeState[] = []
    for (const [nodeId, changes] of changesByNode) {
      const sorted = topologicalSort(changes)
      let state = createEmptyState(nodeId, sorted[0])
      for (const change of sorted) {
        state = applyChangeToState(state, change)
      }
      if (!state.deleted) {
        results.push(state)
      }
    }

    return results
  }

  /**
   * The hash-anchored frontier at a timeline position: each member's latest
   * change at or before the position (Patchwork's checkpoint shape). Members
   * with no entry yet are absent — they didn't exist at that moment.
   */
  frontierAtPosition(timeline: readonly ScopeTimelineEntry[], targetIndex: number): Frontier {
    const frontier: Frontier = {}
    const end = Math.min(targetIndex, timeline.length - 1)
    for (let i = 0; i <= end; i++) {
      const entry = timeline[i]
      frontier[entry.nodeId] = { hash: entry.change.hash }
    }
    return frontier
  }
}

/**
 * Seek accelerator: pre-computed scope states at regular intervals along the
 * merged timeline (the generalization of `SchemaScrubCache`).
 */
export class ScopeScrubCache {
  private cache = new Map<number, NodeState[]>()
  private timeline: ScopeTimelineEntry[] = []
  private resolution: number

  constructor(resolution = 20) {
    this.resolution = resolution
  }

  /** Pre-compute states at regular intervals along the scope's timeline. */
  async precompute(nodeIds: readonly NodeId[], scopeTimeline: ScopeTimeline): Promise<void> {
    this.timeline = await scopeTimeline.getMergedTimeline(nodeIds)
    if (this.timeline.length === 0) return

    for (let i = 0; i < this.timeline.length; i += this.resolution) {
      this.cache.set(i, await scopeTimeline.materializeScopeAt(this.timeline, i))
    }

    const lastIdx = this.timeline.length - 1
    if (!this.cache.has(lastIdx)) {
      this.cache.set(lastIdx, await scopeTimeline.materializeScopeAt(this.timeline, lastIdx))
    }
  }

  /** States at a position — exact cache hit or full reconstruction. */
  async getStatesAt(position: number, scopeTimeline: ScopeTimeline): Promise<NodeState[]> {
    if (this.timeline.length === 0) return []
    const clamped = Math.max(0, Math.min(position, this.timeline.length - 1))
    if (this.cache.has(clamped)) return this.cache.get(clamped)!
    return scopeTimeline.materializeScopeAt(this.timeline, clamped)
  }

  get totalChanges(): number {
    return this.timeline.length
  }

  getTimeline(): ScopeTimelineEntry[] {
    return this.timeline
  }

  clear(): void {
    this.cache.clear()
    this.timeline = []
  }
}

function inferScopeOperation(
  change: NodeChange,
  changeCountForNode: number
): TimelineEntry['operation'] {
  if (changeCountForNode === 0) return 'create'
  if (change.payload.deleted === true) return 'delete'
  if (change.payload.deleted === false) return 'restore'
  return 'update'
}
