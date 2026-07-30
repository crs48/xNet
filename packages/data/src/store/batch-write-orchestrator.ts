/**
 * Deterministic-import planning and application for `NodeStore`
 * (exploration 0276).
 *
 * Importers with stable node IDs get one Lamport timestamp and batch ID for
 * the whole import: `planDeterministicNodeImport` preflights + materializes +
 * signs in memory, and either the adapter applies the plan in one
 * `applyNodeBatch` (fast path, chosen by the store) or
 * `executeDeterministicNodeImport` persists it through the legacy
 * per-collection writes inside a storage transaction.
 *
 * Uses the same `WriteExecutionHost` capability set as the transaction
 * executors, so all write strategies share one seam into `NodeStore`.
 */

import type {
  ApplyNodeBatchResult,
  DeterministicNodeImportDraft,
  NodeBatchWriteTimings,
  NodeChange,
  NodeId,
  NodePayload,
  NodeState,
  NodeStorageAdapter
} from './types'
import type { SchemaIRI } from '../schema/node'
import type { PendingTransactionEvent, WriteExecutionHost } from './transaction-executor'

export type DeterministicNodeImportPlan = {
  created: number
  updated: number
  nodes: NodeState[]
  changes: NodeChange[]
  events: PendingTransactionEvent[]
  affectedSchemaIds: SchemaIRI[]
  timings: Pick<NodeBatchWriteTimings, 'preflightMs' | 'materializeMs'>
}

export type DeterministicNodeImportAppliedPlan = DeterministicNodeImportPlan & {
  applyMs: number
  storage?: ApplyNodeBatchResult
}

const elapsedMs = (startedAt: number): number => Math.max(0, Date.now() - startedAt)

export type DeterministicNodeImportInput = {
  drafts: readonly DeterministicNodeImportDraft[]
  storage: NodeStorageAdapter
  lamport: number
  now: number
  batchId: string
  batchSize: number
}

export async function planDeterministicNodeImport(
  host: WriteExecutionHost,
  input: DeterministicNodeImportInput
): Promise<DeterministicNodeImportPlan> {
  const ids = input.drafts.map((draft) => draft.id)
  const preflightStartedAt = Date.now()
  const preflight = await host.getBatchPreflight(ids, input.storage)
  const preflightMs = elapsedMs(preflightStartedAt)
  const materializeStartedAt = Date.now()
  const existingNodes = host.cloneNodeMap(preflight.nodesById)
  const lastChanges = new Map(preflight.lastChangesByNodeId)
  const nodesById = new Map<NodeId, NodeState>(existingNodes)
  const changedIds: NodeId[] = []
  const seenChangedIds = new Set<NodeId>()
  const changes: NodeChange[] = []
  const events: PendingTransactionEvent[] = []
  let created = 0
  let updated = 0

  for (let index = 0; index < input.drafts.length; index++) {
    const draft = input.drafts[index]
    const currentNode = nodesById.get(draft.id) ?? null
    const previousNode = host.cloneNodeState(currentNode)
    const isCreate = currentNode === null
    const payload: NodePayload = {
      nodeId: draft.id,
      ...(isCreate ? { schemaId: draft.schemaId } : {}),
      properties: draft.properties
    }
    const change = await host.createBatchedChangeWithParentHash(
      'node-change',
      payload,
      lastChanges.get(draft.id)?.hash ?? null,
      input.lamport,
      input.now,
      input.batchId,
      index,
      input.batchSize
    )
    const node = host.materializeNodeChange(
      change,
      currentNode ?? host.createInitialNodeFromChange(change, draft.schemaId)
    )

    nodesById.set(draft.id, node)
    lastChanges.set(draft.id, change)
    changes.push(change)
    events.push({ change, result: host.cloneNodeState(node), previousNode })

    if (!seenChangedIds.has(draft.id)) {
      changedIds.push(draft.id)
      seenChangedIds.add(draft.id)
    }

    if (isCreate) {
      created += 1
    } else {
      updated += 1
    }
  }

  const nodes = changedIds.flatMap((id) => {
    const node = nodesById.get(id)
    return node ? [node] : []
  })
  const affectedSchemaIds = Array.from(new Set(nodes.map((node) => node.schemaId)))

  return {
    created,
    updated,
    nodes,
    changes,
    events,
    affectedSchemaIds,
    timings: {
      preflightMs,
      materializeMs: elapsedMs(materializeStartedAt)
    }
  }
}

/** Legacy application path: per-collection writes inside a transaction. */
export async function executeDeterministicNodeImport(
  host: WriteExecutionHost,
  input: DeterministicNodeImportInput & { deferIndexes: boolean }
): Promise<DeterministicNodeImportAppliedPlan> {
  const plan = await planDeterministicNodeImport(host, input)

  const applyStartedAt = Date.now()
  await host.importMaterializedNodes(input.storage, plan.nodes, {
    deferIndexes: input.deferIndexes
  })
  await host.appendImportedChanges(input.storage, plan.changes)
  await input.storage.setLastLamportTime(host.clockTime())

  for (const node of plan.nodes) {
    await host.persistEncryptedNodeSnapshot(node, input.storage)
  }

  return {
    ...plan,
    applyMs: elapsedMs(applyStartedAt)
  }
}
