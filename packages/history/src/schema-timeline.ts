/**
 * SchemaTimeline - Merged multi-node timeline for database time machine
 *
 * Merges change logs from all nodes of a schema into a single unified
 * timeline, sorted by Lamport time. Supports materializing all rows
 * at any historical point.
 */

import { topologicalSort, compareLamportTimestamps } from '@xnet/sync'
import type {
  NodeChange,
  NodeStorageAdapter,
  NodeId,
  NodeState,
  NodeStore,
  TransactionOperation
} from '@xnet/data'
import type { SchemaIRI } from '@xnet/data'
import type { SchemaTimelineEntry, TimelineEntry } from './types'
import { createEmptyState, applyChangeToState } from './engine'
import { deepEqual } from './utils'

export class SchemaTimeline {
  constructor(private storage: NodeStorageAdapter) {}

  /** Get a merged timeline of all changes across all nodes of a schema */
  async getMergedTimeline(schemaIRI: SchemaIRI): Promise<SchemaTimelineEntry[]> {
    // Get all nodes of this schema
    const nodes = await this.storage.listNodes({ schemaId: schemaIRI, includeDeleted: true })

    if (nodes.length === 0) return []

    // Get all changes for all these nodes
    const allChanges: { change: NodeChange; nodeId: NodeId }[] = []
    await Promise.all(
      nodes.map(async (node) => {
        const changes = await this.storage.getChanges(node.id)
        for (const change of changes) {
          allChanges.push({ change, nodeId: node.id })
        }
      })
    )

    if (allChanges.length === 0) return []

    // Sort by Lamport time (global causal order)
    allChanges.sort((a, b) => compareLamportTimestamps(a.change.lamport, b.change.lamport))

    // Convert to timeline entries
    // Track per-node change count to infer create vs update
    const nodeChangeCount = new Map<NodeId, number>()

    return allChanges.map(({ change, nodeId }, index) => {
      const count = nodeChangeCount.get(nodeId) ?? 0
      nodeChangeCount.set(nodeId, count + 1)

      return {
        index,
        change,
        nodeId,
        properties: Object.keys(change.payload.properties ?? {}),
        operation: this.inferOperation(change, count),
        author: change.authorDID,
        wallTime: change.wallTime,
        lamport: change.lamport,
        batchId: change.batchId,
        batchSize: change.batchSize
      }
    })
  }

  /** Reconstruct all nodes of a schema at a specific timeline position */
  async materializeSchemaAt(
    timeline: SchemaTimelineEntry[],
    targetIndex: number
  ): Promise<NodeState[]> {
    if (timeline.length === 0 || targetIndex < 0 || targetIndex >= timeline.length) return []

    // Group changes by nodeId, filtered to <= targetIndex
    const changesByNode = new Map<NodeId, NodeChange[]>()
    for (let i = 0; i <= targetIndex; i++) {
      const entry = timeline[i]
      if (!changesByNode.has(entry.nodeId)) {
        changesByNode.set(entry.nodeId, [])
      }
      changesByNode.get(entry.nodeId)!.push(entry.change)
    }

    // Reconstruct each node
    const results: NodeState[] = []
    for (const [nodeId, changes] of changesByNode) {
      const sorted = topologicalSort(changes)
      let state = createEmptyState(nodeId, sorted[0])
      for (const change of sorted) {
        state = applyChangeToState(state, change)
      }
      // Skip deleted nodes
      if (!state.deleted) {
        results.push(state)
      }
    }

    return results
  }

  private inferOperation(
    change: NodeChange,
    changeCountForNode: number
  ): TimelineEntry['operation'] {
    if (changeCountForNode === 0) return 'create'
    if (change.payload.deleted === true) return 'delete'
    if (change.payload.deleted === false) return 'restore'
    return 'update'
  }
}

// ─── Schema Restore ──────────────────────────────────────────

/**
 * Restore all rows of a schema to a historical point using transactions.
 *
 * Compares the current live state to the historical state and creates
 * a single transaction with all the compensating changes needed:
 * - Rows that exist now but didn't then -> delete
 * - Rows that existed then but are deleted now -> restore + update
 * - Rows with different values -> update to historical values
 *
 * @returns The number of operations applied
 */
export async function restoreSchemaAt(
  store: NodeStore,
  schemaTimeline: SchemaTimeline,
  timeline: SchemaTimelineEntry[],
  targetIndex: number,
  schemaIRI: SchemaIRI
): Promise<number> {
  // Get historical state
  const historicalRows = await schemaTimeline.materializeSchemaAt(timeline, targetIndex)
  const historicalMap = new Map(historicalRows.map((r) => [r.id, r]))

  // Get current live state
  const currentRows = await store.list({ schemaId: schemaIRI })
  const currentMap = new Map(currentRows.map((r) => [r.id, r]))

  // Also get deleted nodes to see if we need to restore any
  const allCurrentRows = await store.list({ schemaId: schemaIRI, includeDeleted: true })
  const allCurrentMap = new Map(allCurrentRows.map((r) => [r.id, r]))

  const operations: TransactionOperation[] = []

  // Rows that exist now but didn't exist then -> delete
  for (const [id] of currentMap) {
    if (!historicalMap.has(id)) {
      operations.push({ type: 'delete', nodeId: id })
    }
  }

  // Rows that existed then -> ensure they exist now with correct values
  for (const [id, historicalNode] of historicalMap) {
    const current = currentMap.get(id)
    const currentWithDeleted = allCurrentMap.get(id)

    if (!current && currentWithDeleted?.deleted) {
      // Row was deleted since then -> restore it
      operations.push({ type: 'restore', nodeId: id })
      // Then update to historical values
      const updates: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(historicalNode.properties)) {
        if (!deepEqual(currentWithDeleted.properties[key], value)) {
          updates[key] = value
        }
      }
      if (Object.keys(updates).length > 0) {
        operations.push({ type: 'update', nodeId: id, options: { properties: updates } })
      }
    } else if (current) {
      // Row exists — diff and update
      const updates: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(historicalNode.properties)) {
        if (!deepEqual(current.properties[key], value)) {
          updates[key] = value
        }
      }
      if (Object.keys(updates).length > 0) {
        operations.push({ type: 'update', nodeId: id, options: { properties: updates } })
      }
    }
  }

  if (operations.length > 0) {
    await store.transaction(operations)
  }

  return operations.length
}
