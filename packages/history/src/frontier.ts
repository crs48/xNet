/**
 * Frontier — the shared primitive behind scrubbing, checkpoints, and drafts
 * (exploration 0329).
 *
 * A frontier is a per-node map of hash-anchored positions in the change log:
 * the LWW-log analogue of Automerge heads. A read-only view at a frontier is
 * a scrub position; a named, pinned frontier is a checkpoint; a writable
 * continuation forked from one is a draft.
 *
 * Positions are always change *hashes*, never indexes or wall timestamps:
 * after pruning, an index or timestamp silently resolves to a different
 * change, while a hash either resolves exactly or fails loudly (the history
 * horizon).
 */

import type { HistoricalState, HistoryTarget } from './types'
import type { ContentId } from '@xnetjs/core'
import type { NodeId, NodeStorageAdapter } from '@xnetjs/data'
import { topologicalSort } from '@xnetjs/sync'
import type { HistoryEngine } from './engine'

/**
 * One node's position in a frontier: the change hash to view it at, plus an
 * optional reference to a Yjs snapshot pinning the document lane (rich text,
 * canvas) at the same moment. Record-only nodes carry just the hash.
 */
export interface FrontierEntry {
  hash: ContentId
  yjsSnapshotRef?: string
}

/**
 * A frontier: per-node, hash-anchored positions. Nodes absent from the map
 * did not exist at the frontier's moment (or are outside its scope) and fall
 * through to "not present".
 */
export type Frontier = Record<NodeId, FrontierEntry>

// ─── Yjs snapshot references ─────────────────────────────────

/**
 * Yjs snapshots are keyed `(node_id, timestamp)` in storage (`yjs_snapshots`
 * table / `YjsSnapshotStorageAdapter`); a ref encodes that key as one string
 * so it can live inside a `FrontierEntry` or a Checkpoint node property.
 */
export function makeYjsSnapshotRef(nodeId: NodeId, timestamp: number): string {
  return `${nodeId}@${timestamp}`
}

export function parseYjsSnapshotRef(ref: string): { nodeId: NodeId; timestamp: number } | null {
  const at = ref.lastIndexOf('@')
  if (at <= 0) return null
  const timestamp = Number(ref.slice(at + 1))
  if (!Number.isFinite(timestamp)) return null
  return { nodeId: ref.slice(0, at) as NodeId, timestamp }
}

// ─── Pin keys ────────────────────────────────────────────────

/**
 * Pin-registry keys (`NodeStorageAdapter.pins`): a change is pinned under its
 * hash; a Yjs snapshot under a `yjs:`-prefixed ref. Blobs are NOT pinned —
 * referenced blobs past retention are an explicit blob horizon (0329).
 */
export function pinKeyForChange(hash: ContentId): string {
  return hash
}

export function pinKeyForYjsSnapshot(nodeId: NodeId, timestamp: number): string {
  return `yjs:${makeYjsSnapshotRef(nodeId, timestamp)}`
}

// ─── Construction ────────────────────────────────────────────

/**
 * The hash of a node's latest change in its topologically-sorted chain (the
 * position `{ type: 'latest' }` replays to), or null for an unknown node.
 */
export async function headHash(
  storage: NodeStorageAdapter,
  nodeId: NodeId
): Promise<ContentId | null> {
  const changes = await storage.getChanges(nodeId)
  if (changes.length === 0) return null
  const sorted = topologicalSort(changes)
  return sorted[sorted.length - 1].hash
}

/**
 * Capture the *current* frontier of a node set: each node's latest change in
 * its topologically-sorted chain (the same "latest" that `materializeAt`
 * with `{ type: 'latest' }` replays to). Nodes with no changes are omitted.
 */
export async function captureFrontier(
  storage: NodeStorageAdapter,
  nodeIds: readonly NodeId[]
): Promise<Frontier> {
  const frontier: Frontier = {}
  await Promise.all(
    nodeIds.map(async (nodeId) => {
      const changes = await storage.getChanges(nodeId)
      if (changes.length === 0) return
      const sorted = topologicalSort(changes)
      frontier[nodeId] = { hash: sorted[sorted.length - 1].hash }
    })
  )
  return frontier
}

/**
 * Build the frontier "as of" a wall-clock time: each node's latest change at
 * or before `timestamp` (Patchwork's checkpoint approximation — approximate
 * across nodes because cross-node causality is not captured, exact for any
 * frontier captured live). Nodes with no change at or before `timestamp`
 * are omitted — they didn't exist yet.
 */
export async function frontierAtWallTime(
  storage: NodeStorageAdapter,
  nodeIds: readonly NodeId[],
  timestamp: number
): Promise<Frontier> {
  const frontier: Frontier = {}
  await Promise.all(
    nodeIds.map(async (nodeId) => {
      const changes = await storage.getChanges(nodeId)
      if (changes.length === 0) return
      const sorted = topologicalSort(changes)
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].wallTime <= timestamp) {
          frontier[nodeId] = { hash: sorted[i].hash }
          return
        }
      }
      // No change at or before the timestamp: node absent from the frontier.
    })
  )
  return frontier
}

// ─── Consumption ─────────────────────────────────────────────

/** The hash-anchored `HistoryTarget` for a frontier entry. */
export function frontierTarget(entry: FrontierEntry): HistoryTarget {
  return { type: 'hash', hash: entry.hash }
}

/**
 * Materialize every node of a frontier at its own pinned hash. Nodes whose
 * pinned change has been pruned are reported in `missing` (the history
 * horizon) rather than silently skipped or remapped.
 */
export async function materializeAtFrontier(
  engine: HistoryEngine,
  frontier: Frontier
): Promise<{ states: Map<NodeId, HistoricalState>; missing: NodeId[] }> {
  const states = new Map<NodeId, HistoricalState>()
  const missing: NodeId[] = []
  await Promise.all(
    Object.entries(frontier).map(async ([nodeId, entry]) => {
      try {
        states.set(nodeId as NodeId, await engine.materializeAt(nodeId as NodeId, frontierTarget(entry)))
      } catch {
        missing.push(nodeId as NodeId)
      }
    })
  )
  return { states, missing }
}
