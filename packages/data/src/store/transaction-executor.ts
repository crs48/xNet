/**
 * Transaction execution paths for `NodeStore` (exploration 0276).
 *
 * Both paths take the SAME narrow `WriteExecutionHost` capability set instead
 * of reaching into `NodeStore` privates, so the two strategies read
 * side-by-side as pure orchestration:
 *
 * - **Slow path** (`executeTransactionOperations`): one storage round-trip
 *   per operation inside an adapter transaction — required whenever content
 *   encryption or adapters without `applyNodeBatch` are in play.
 * - **Fast path** (`executeTransactionOperationsFast`): one preflight for all
 *   touched nodes, in-memory materialization and signing, then ONE
 *   transactional `applyNodeBatch` (exploration 0263/0264).
 *
 * Conflict tracking is unified by construction: both paths materialize
 * through `host.materializeNodeChange` (→ the shared LWW reducer), and both
 * return `PendingTransactionEvent`s for the caller to dispatch, so listener
 * behavior cannot drift between strategies.
 */

import type { SchemaIRI } from '../schema/node'
import type {
  NodeBatchPreflightResult,
  NodeChange,
  NodeId,
  NodePayload,
  NodeState,
  NodeStorageAdapter,
  TransactionOperation
} from './types'
import { createNodeId } from '../schema/node'

/** One executed operation, queued for post-commit listener dispatch. */
export type PendingTransactionEvent = {
  change: NodeChange
  result: NodeState | null
  previousNode: NodeState | null
}

export type TransactionExecutionResult = {
  results: (NodeState | null)[]
  changes: NodeChange[]
  events: PendingTransactionEvent[]
}

/**
 * The `NodeStore` capabilities the write orchestration needs — nothing more.
 * Implemented by `NodeStore` as bound privates; tests can stub it directly.
 */
export interface WriteExecutionHost {
  readonly storage: NodeStorageAdapter
  clockTime(): number
  cloneNodeState(node: NodeState | null): NodeState | null
  cloneNodeMap(nodesById: ReadonlyMap<NodeId, NodeState>): Map<NodeId, NodeState>
  getBatchPreflight(
    ids: readonly NodeId[],
    storage: NodeStorageAdapter
  ): Promise<NodeBatchPreflightResult>
  createBatchedChange(
    type: string,
    payload: NodePayload,
    lamport: number,
    wallTime: number,
    batchId: string,
    batchIndex: number,
    batchSize: number,
    storage: NodeStorageAdapter
  ): Promise<NodeChange>
  createBatchedChangeWithParentHash(
    type: string,
    payload: NodePayload,
    parentHash: NodeChange['parentHash'],
    lamport: number,
    wallTime: number,
    batchId: string,
    batchIndex: number,
    batchSize: number
  ): Promise<NodeChange>
  applyChange(change: NodeChange, storage: NodeStorageAdapter): Promise<void>
  materializeNodeChange(change: NodeChange, currentNode: NodeState): NodeState
  createInitialNodeFromChange(change: NodeChange, schemaId: SchemaIRI): NodeState
  persistEncryptedNodeSnapshot(
    node: NodeState | null,
    storage: NodeStorageAdapter
  ): Promise<void>
  importMaterializedNodes(
    storage: NodeStorageAdapter,
    nodes: readonly NodeState[],
    options?: { deferIndexes?: boolean }
  ): Promise<void>
  appendImportedChanges(
    storage: NodeStorageAdapter,
    changes: readonly NodeChange[]
  ): Promise<void>
}

export type TransactionExecutionInput = {
  operations: TransactionOperation[]
  lamport: number
  now: number
  batchId: string
  batchSize: number
}

/** Legacy per-operation path (runs inside `storage.withTransaction`). */
export async function executeTransactionOperations(
  host: WriteExecutionHost,
  input: TransactionExecutionInput & { storage: NodeStorageAdapter }
): Promise<TransactionExecutionResult> {
  const results: (NodeState | null)[] = []
  const changes: NodeChange[] = []
  const events: PendingTransactionEvent[] = []

  for (let i = 0; i < input.operations.length; i++) {
    const op = input.operations[i]
    let change: NodeChange
    let result: NodeState | null = null
    let previousNode: NodeState | null = null

    switch (op.type) {
      case 'create': {
        const id = op.options.id ?? createNodeId()
        const payload: NodePayload = {
          nodeId: id,
          schemaId: op.options.schemaId,
          properties: op.options.properties
        }
        change = await host.createBatchedChange(
          'node-change',
          payload,
          input.lamport,
          input.now,
          input.batchId,
          i,
          input.batchSize,
          input.storage
        )
        await host.applyChange(change, input.storage)
        result = await input.storage.getNode(id)
        await host.persistEncryptedNodeSnapshot(result, input.storage)
        break
      }

      case 'update': {
        const existing = host.cloneNodeState(await input.storage.getNode(op.nodeId))
        if (!existing) {
          throw new Error(`Node not found: ${op.nodeId}`)
        }
        previousNode = existing
        const payload: NodePayload = {
          nodeId: op.nodeId,
          properties: op.options.properties
        }
        change = await host.createBatchedChange(
          'node-change',
          payload,
          input.lamport,
          input.now,
          input.batchId,
          i,
          input.batchSize,
          input.storage
        )
        await host.applyChange(change, input.storage)
        result = await input.storage.getNode(op.nodeId)
        await host.persistEncryptedNodeSnapshot(result, input.storage)
        break
      }

      case 'delete': {
        const existing = host.cloneNodeState(await input.storage.getNode(op.nodeId))
        if (!existing) {
          throw new Error(`Node not found: ${op.nodeId}`)
        }
        previousNode = existing
        const payload: NodePayload = {
          nodeId: op.nodeId,
          properties: {},
          deleted: true
        }
        change = await host.createBatchedChange(
          'node-change',
          payload,
          input.lamport,
          input.now,
          input.batchId,
          i,
          input.batchSize,
          input.storage
        )
        await host.applyChange(change, input.storage)
        result = null
        break
      }

      case 'restore': {
        const existing = host.cloneNodeState(await input.storage.getNode(op.nodeId))
        if (!existing) {
          throw new Error(`Node not found: ${op.nodeId}`)
        }
        previousNode = existing
        const payload: NodePayload = {
          nodeId: op.nodeId,
          properties: {},
          deleted: false
        }
        change = await host.createBatchedChange(
          'node-change',
          payload,
          input.lamport,
          input.now,
          input.batchId,
          i,
          input.batchSize,
          input.storage
        )
        await host.applyChange(change, input.storage)
        result = await input.storage.getNode(op.nodeId)
        await host.persistEncryptedNodeSnapshot(result, input.storage)
        break
      }
    }

    changes.push(change)
    results.push(result)
    events.push({ change, result, previousNode })
  }

  return { results, changes, events }
}

/**
 * Transaction fast path: one preflight for all touched nodes, in-memory
 * materialization and signing, then one transactional applyNodeBatch.
 * Avoids the per-operation storage round trips of
 * {@link executeTransactionOperations} and the adapter-level withTransaction
 * snapshotting that dominates small interactive transactions.
 */
export async function executeTransactionOperationsFast(
  host: WriteExecutionHost,
  input: TransactionExecutionInput
): Promise<TransactionExecutionResult> {
  const planned = input.operations.map((op) => ({
    op,
    id: op.type === 'create' ? (op.options.id ?? createNodeId()) : op.nodeId
  }))

  const preflight = await host.getBatchPreflight(
    planned.map((entry) => entry.id),
    host.storage
  )
  const nodesById = host.cloneNodeMap(preflight.nodesById)
  const lastChanges = new Map(preflight.lastChangesByNodeId)

  const results: (NodeState | null)[] = []
  const changes: NodeChange[] = []
  const events: PendingTransactionEvent[] = []
  const affectedSchemaIds = new Set<SchemaIRI>()

  for (let i = 0; i < planned.length; i++) {
    const { op, id } = planned[i]
    const existing = nodesById.get(id) ?? null

    if (op.type !== 'create' && !existing) {
      throw new Error(`Node not found: ${id}`)
    }

    const payload: NodePayload =
      op.type === 'create'
        ? { nodeId: id, schemaId: op.options.schemaId, properties: op.options.properties }
        : op.type === 'update'
          ? { nodeId: id, properties: op.options.properties }
          : { nodeId: id, properties: {}, deleted: op.type === 'delete' }

    const change = await host.createBatchedChangeWithParentHash(
      'node-change',
      payload,
      lastChanges.get(id)?.hash ?? null,
      input.lamport,
      input.now,
      input.batchId,
      i,
      input.batchSize
    )

    const schemaId = existing?.schemaId ?? (op.type === 'create' ? op.options.schemaId : null)
    if (!schemaId) {
      throw new Error(`First change for node ${id} must include schemaId`)
    }

    const node = host.materializeNodeChange(
      change,
      existing ?? host.createInitialNodeFromChange(change, schemaId)
    )

    nodesById.set(id, node)
    lastChanges.set(id, change)
    affectedSchemaIds.add(schemaId)
    changes.push(change)
    const result = op.type === 'delete' ? null : node
    results.push(result)
    events.push({ change, result, previousNode: existing })
  }

  const touchedIds = Array.from(new Set(planned.map((entry) => entry.id)))
  await host.storage.applyNodeBatch!({
    batchId: input.batchId,
    nodes: touchedIds.flatMap((id) => {
      const node = nodesById.get(id)
      return node ? [node] : []
    }),
    changes,
    lastLamportTime: host.clockTime(),
    affectedSchemaIds: Array.from(affectedSchemaIds),
    indexMode: 'touched',
    indexProperties: true
  })

  return { results, changes, events }
}
