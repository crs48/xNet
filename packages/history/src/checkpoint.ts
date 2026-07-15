/**
 * Checkpoints — named, pinned frontiers (exploration 0329).
 *
 * A checkpoint captures each member's chain position (hash-anchored, plus an
 * optional Yjs snapshot ref for doc-bearing members), stores it on a
 * `Checkpoint` node, and pins every referenced hash/snapshot under the
 * checkpoint's node id so pruning and snapshot eviction cannot orphan it.
 * Deleting the checkpoint releases all its pins.
 */

import { CHECKPOINT_SCHEMA_IRI } from '@xnetjs/data'
import type {
  NodeId,
  NodeState,
  NodeStorageAdapter,
  NodeStore,
  PinEntry,
  SchemaIRI,
  TransactionOperation
} from '@xnetjs/data'
import type { HistoryEngine } from './engine'
import {
  captureFrontier,
  makeYjsSnapshotRef,
  pinKeyForChange,
  pinKeyForYjsSnapshot,
  parseYjsSnapshotRef,
  type Frontier
} from './frontier'
import { deepEqual } from './utils'

export interface CreateCheckpointOptions {
  /** User-given version name. */
  name: string
  /** Optional longer note. */
  note?: string
  /** Scope membership to capture (page + threads, database + rows, …). */
  nodeIds: readonly NodeId[]
  /** Optional scope node the checkpoint hangs off (for listing). */
  scopeId?: NodeId
  /**
   * Force-capture a Yjs snapshot for a doc-bearing member and return its
   * storage timestamp (callers wire `DocumentHistoryEngine.forceCapture`
   * with the live doc; nodes without a doc return null).
   */
  captureYjsSnapshot?: (nodeId: NodeId) => Promise<{ timestamp: number } | null>
}

/**
 * Capture the current frontier of `nodeIds`, create the Checkpoint node, and
 * pin every referenced change hash and Yjs snapshot under its id.
 */
export async function createCheckpoint(
  store: NodeStore,
  storage: NodeStorageAdapter,
  options: CreateCheckpointOptions
): Promise<NodeState> {
  const frontier = await captureFrontier(storage, options.nodeIds)

  if (options.captureYjsSnapshot) {
    await Promise.all(
      Object.keys(frontier).map(async (nodeId) => {
        const captured = await options.captureYjsSnapshot!(nodeId as NodeId)
        if (captured) {
          frontier[nodeId as NodeId].yjsSnapshotRef = makeYjsSnapshotRef(
            nodeId as NodeId,
            captured.timestamp
          )
        }
      })
    )
  }

  const checkpoint = await store.create({
    schemaId: CHECKPOINT_SCHEMA_IRI as SchemaIRI,
    properties: {
      name: options.name,
      ...(options.note !== undefined ? { note: options.note } : {}),
      frontier,
      ...(options.scopeId !== undefined ? { scope: options.scopeId } : {})
    }
  })

  await pinFrontier(storage, frontier, checkpoint.id, 'checkpoint')
  return checkpoint
}

/** Pin every hash + Yjs snapshot ref of a frontier under `ownerId`. */
export async function pinFrontier(
  storage: NodeStorageAdapter,
  frontier: Frontier,
  ownerId: string,
  reason: string
): Promise<void> {
  if (!storage.pins) return
  const pins: PinEntry[] = []
  for (const [nodeId, entry] of Object.entries(frontier)) {
    pins.push({ key: pinKeyForChange(entry.hash), ownerId, reason })
    if (entry.yjsSnapshotRef) {
      const parsed = parseYjsSnapshotRef(entry.yjsSnapshotRef)
      if (parsed) {
        pins.push({ key: pinKeyForYjsSnapshot(nodeId as NodeId, parsed.timestamp), ownerId, reason })
      }
    }
  }
  await storage.pins.addPins(pins)
}

/** List checkpoints, optionally filtered to one scope node. */
export async function listCheckpoints(
  store: NodeStore,
  scopeId?: NodeId
): Promise<NodeState[]> {
  const all = await store.list({ schemaId: CHECKPOINT_SCHEMA_IRI as SchemaIRI })
  const filtered = scopeId ? all.filter((c) => c.properties.scope === scopeId) : all
  return filtered.sort((a, b) => b.createdAt - a.createdAt)
}

/** Delete a checkpoint and release every pin it holds. */
export async function deleteCheckpoint(
  store: NodeStore,
  storage: NodeStorageAdapter,
  checkpointId: NodeId
): Promise<void> {
  await storage.pins?.removePinsByOwner(checkpointId)
  await store.delete(checkpointId)
}

export interface RestoreResult {
  /** Number of operations applied (0 = already at the checkpoint). */
  operations: number
  /** Members whose pinned change could not be materialized (horizon). */
  missing: NodeId[]
}

/**
 * Restore members to a checkpoint's frontier as ONE compensating transaction
 * (the same shape as `restoreSchemaAt`/undo: new changes, no log rewriting —
 * so the restore itself is undoable).
 *
 * Members currently deleted are restored-then-updated; `currentMemberIds`
 * (the scope's membership *now*) lets the restore also delete nodes created
 * after the checkpoint. Yjs document content is NOT restored here — that is
 * the Time Machine UI's document lane (`DocumentHistoryEngine`).
 */
export async function restoreToFrontier(
  store: NodeStore,
  engine: HistoryEngine,
  frontier: Frontier,
  currentMemberIds?: readonly NodeId[]
): Promise<RestoreResult> {
  const operations: TransactionOperation[] = []
  const missing: NodeId[] = []

  for (const [id, entry] of Object.entries(frontier)) {
    const nodeId = id as NodeId
    let historical: NodeState
    try {
      const result = await engine.materializeAt(nodeId, { type: 'hash', hash: entry.hash })
      historical = result.node
    } catch {
      missing.push(nodeId)
      continue
    }

    const current = await store.get(nodeId)
    if (current?.deleted) {
      operations.push({ type: 'restore', nodeId })
    }

    const updates: Record<string, unknown> = {}
    const reference = current?.properties ?? {}
    for (const [key, value] of Object.entries(historical.properties)) {
      if (!deepEqual(reference[key], value)) updates[key] = value
    }
    if (Object.keys(updates).length > 0) {
      operations.push({ type: 'update', nodeId, options: { properties: updates } })
    }
  }

  if (currentMemberIds) {
    const inFrontier = new Set(Object.keys(frontier))
    for (const nodeId of currentMemberIds) {
      if (!inFrontier.has(nodeId)) {
        operations.push({ type: 'delete', nodeId })
      }
    }
  }

  if (operations.length > 0) {
    await store.transaction(operations)
  }

  return { operations: operations.length, missing }
}
