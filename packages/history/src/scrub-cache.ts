/**
 * ScrubCache - Pre-computed states for smooth timeline seeking
 *
 * Computes node states at regular intervals so scrubbing only needs
 * to replay at most `resolution` changes per position change.
 */

import type { NodeChange, NodeState, NodeStorageAdapter, NodeId } from '@xnetjs/data'
import { topologicalSort } from '@xnetjs/sync'
import { createEmptyState, applyChangeToState } from './engine'

export class ScrubCache {
  private cache = new Map<number, NodeState>()
  private changes: NodeChange[] = []
  private resolution: number

  constructor(resolution = 10) {
    this.resolution = resolution
  }

  /** Pre-compute states at regular intervals for a node */
  async precompute(nodeId: NodeId, storage: NodeStorageAdapter): Promise<void> {
    const allChanges = await storage.getChanges(nodeId)
    this.changes = topologicalSort(allChanges)

    if (this.changes.length === 0) return

    let state = createEmptyState(nodeId, this.changes[0])
    for (let i = 0; i < this.changes.length; i++) {
      state = applyChangeToState(state, this.changes[i])
      if (i % this.resolution === 0) {
        this.cache.set(i, structuredClone(state))
      }
    }
    // Always cache the final state
    this.cache.set(this.changes.length - 1, structuredClone(state))
  }

  /** Fast seek to any index (max `resolution` replays) */
  getStateAt(index: number): NodeState | null {
    if (this.changes.length === 0) return null
    const clamped = Math.max(0, Math.min(index, this.changes.length - 1))

    const nearestCacheIndex = Math.floor(clamped / this.resolution) * this.resolution
    let state = this.cache.get(nearestCacheIndex)
    if (!state) return null

    state = structuredClone(state)

    for (let i = nearestCacheIndex + 1; i <= clamped; i++) {
      state = applyChangeToState(state, this.changes[i])
    }

    return state
  }

  /** Get the change at a specific index */
  getChangeAt(index: number): NodeChange | null {
    return this.changes[index] ?? null
  }

  get totalChanges(): number {
    return this.changes.length
  }

  clear(): void {
    this.cache.clear()
    this.changes = []
  }
}
