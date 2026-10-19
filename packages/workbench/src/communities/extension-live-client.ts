import type { ExtensionMutationResult } from './extension-broker'
import type { ExtensionDataset } from './extension-data'
import type { ExtensionOperation, ExtensionRequest } from './extension-protocol'
import type { DataBridge, QuerySubscription } from '@xnetjs/data-bridge'
import { createExtensionDataBridge } from './extension-data'
import { ExtensionAccessError } from './extension-protocol'

/** Only snapshots and the closed RPC protocol cross this boundary. No host object is installed. */
export function createLiveExtensionBridge(
  initial: ExtensionDataset,
  request: (request: ExtensionRequest) => Promise<ExtensionMutationResult>
) {
  let dataset = initial
  let snapshotBridge = createExtensionDataBridge(dataset)
  const observers = new Set<() => void>()
  const sessionId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  let sequence = 0
  const update = (next: ExtensionDataset) => {
    dataset = next
    snapshotBridge = createExtensionDataBridge(next)
    observers.forEach((notify) => notify())
  }
  const mutate = async (operations: ExtensionOperation[]) => {
    const result = await request({
      version: 1,
      id: `${sessionId}-${++sequence}`,
      operation: 'data.mutate',
      operations
    })
    const nodes = new Map(dataset.nodes.map((node) => [node.id, node]))
    for (const node of result.results) {
      if (node?.deleted) nodes.delete(node.id)
      else if (node) nodes.set(node.id, node)
    }
    const created = operations.flatMap((op, index) =>
      op.type === 'create' && result.results[index]
        ? [{ id: result.results[index]!.id, schemaId: result.results[index]!.schemaId }]
        : []
    )
    update({
      documents: dataset.documents,
      grant: { ...dataset.grant, records: [...dataset.grant.records, ...created] },
      nodes: [...nodes.values()]
    })
    return result
  }
  const one = async (operations: ExtensionOperation[]) => {
    const result = (await mutate(operations)).results[0]
    if (!result) throw new ExtensionAccessError('conflict', 'The mutation did not return a record.')
    return result
  }
  const bridge: DataBridge = {
    ...snapshotBridge,
    query(schema, options) {
      let subscription = snapshotBridge.query(schema, options)
      const listeners = new Set<() => void>()
      const refresh = () => {
        subscription = snapshotBridge.query(schema, options)
        listeners.forEach((fn) => fn())
      }
      const result: QuerySubscription = {
        getSnapshot: () => subscription.getSnapshot(),
        getMetadata: () => subscription.getMetadata?.() ?? null,
        subscribe(listener) {
          listeners.add(listener)
          observers.add(refresh)
          refresh()
          return () => {
            listeners.delete(listener)
            if (!listeners.size) observers.delete(refresh)
          }
        }
      }
      return result
    },
    create: (schema, props, id) =>
      one([{ type: 'create', schemaId: schema._schemaId, properties: props, id }]),
    update: (nodeId, props) => one([{ type: 'update', nodeId, properties: props }]),
    delete: async (nodeId) => {
      await one([{ type: 'delete', nodeId }])
    },
    restore: (nodeId) => one([{ type: 'restore', nodeId }]),
    transaction: (operations, conditions) => {
      if (conditions)
        throw new ExtensionAccessError('denied', 'Preconditions are owned by the host broker.')
      return mutate(
        operations.map((op) =>
          op.type === 'create'
            ? {
                type: 'create',
                id: op.options.id,
                schemaId: op.options.schemaId,
                properties: op.options.properties ?? {}
              }
            : op.type === 'update'
              ? { type: 'update', nodeId: op.nodeId, properties: op.options.properties }
              : op
        )
      )
    },
    destroy: () => observers.clear()
  }
  return {
    bridge,
    update,
    documents: {
      subscribe(listener: () => void) {
        observers.add(listener)
        return () => {
          observers.delete(listener)
        }
      },
      get(nodeId: string) {
        if (!dataset.grant.documents?.read.includes(nodeId))
          throw new ExtensionAccessError('denied', 'Document access has not been approved.')
        const document = dataset.documents?.find((item) => item.nodeId === nodeId)
        if (!document) throw new ExtensionAccessError('denied', 'This document is unavailable.')
        return document
      }
    }
  }
}
