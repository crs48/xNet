/**
 * NodeStore instrumentation
 *
 * Subscribes to node change events and emits typed DevTools events for
 * creates, updates, deletes, restores, remote changes, and conflicts.
 *
 * The change events can come from a main-thread NodeStore or from a
 * worker-resident store via `DataBridge.subscribeToChanges` (0164) — the
 * event shape is identical either way.
 */

import type { DevToolsEventBus } from '../core/event-bus'
import type { DevToolsEventInput } from '../core/types'
import type { NodeStore, NodeChangeEvent } from '@xnetjs/data'
import { DEFAULTS } from '../core/constants'

function changeProperties(payload: Record<string, unknown>): Record<string, unknown> {
  return (payload.properties || {}) as Record<string, unknown>
}

/**
 * Map a local (non-remote) node change onto the DevTools event taxonomy
 * by payload shape: create has a schemaId, delete/restore toggle the
 * deleted flag, everything else is an update.
 */
function classifyLocalStoreEvent(
  nodeId: string,
  payload: Record<string, unknown>,
  change: NodeChangeEvent['change']
): DevToolsEventInput {
  const schemaId = payload.schemaId as string | undefined
  const deleted = payload.deleted as boolean | undefined

  if (deleted === true) {
    return { type: 'store:delete', nodeId, duration: 0 }
  }
  if (schemaId) {
    return {
      type: 'store:create',
      nodeId,
      schemaId,
      properties: changeProperties(payload),
      lamport: change.lamport,
      duration: 0
    }
  }
  if (deleted === false) {
    return { type: 'store:restore', nodeId, duration: 0 }
  }
  return {
    type: 'store:update',
    nodeId,
    properties: changeProperties(payload),
    lamport: change.lamport,
    duration: 0
  }
}

function emitStoreEvent(bus: DevToolsEventBus, event: NodeChangeEvent): void {
  const { change, isRemote } = event
  const payload = change.payload as unknown as Record<string, unknown>
  const nodeId = payload.nodeId as string

  if (isRemote) {
    bus.emit({
      type: 'store:remote-change',
      change: change as any,
      nodeId,
      isRemote: true
    })
    return
  }

  bus.emit(classifyLocalStoreEvent(nodeId, payload, change))
}

/**
 * Instrument any node change feed (a subscribe function returning an
 * unsubscriber). Used directly for bridge-level feeds where no NodeStore
 * is reachable from the main thread.
 */
export function instrumentChangeFeed(
  subscribe: (listener: (event: NodeChangeEvent) => void) => () => void,
  bus: DevToolsEventBus
): () => void {
  return subscribe((event: NodeChangeEvent) => emitStoreEvent(bus, event))
}

function emitRecentConflicts(store: NodeStore, bus: DevToolsEventBus): void {
  const conflicts = store.getRecentConflicts ? store.getRecentConflicts() : []
  if (conflicts.length === 0) return

  conflicts.forEach((conflict) => {
    // True divergence vs informational LWW housekeeping (exploration 0296).
    bus.emit({
      type: conflict.kind === 'lww-resolution' ? 'store:lww-resolution' : 'store:conflict',
      conflict
    })
  })
  store.clearConflicts?.()
}

export function instrumentStore(store: NodeStore, bus: DevToolsEventBus): () => void {
  // Listen to all store changes via the existing subscribe mechanism
  const unsubscribe = instrumentChangeFeed((listener) => store.subscribe(listener), bus)

  // Poll for conflicts periodically
  const conflictInterval = setInterval(() => {
    emitRecentConflicts(store, bus)
  }, DEFAULTS.CONFLICT_POLL_MS)

  return () => {
    unsubscribe()
    clearInterval(conflictInterval)
  }
}
