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
import type { NodeStore, NodeChangeEvent } from '@xnetjs/data'
import { DEFAULTS } from '../core/constants'

/**
 * Instrument any node change feed (a subscribe function returning an
 * unsubscriber). Used directly for bridge-level feeds where no NodeStore
 * is reachable from the main thread.
 */
export function instrumentChangeFeed(
  subscribe: (listener: (event: NodeChangeEvent) => void) => () => void,
  bus: DevToolsEventBus
): () => void {
  return subscribe((event: NodeChangeEvent) => {
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

    // Determine operation type from payload shape
    const schemaId = payload.schemaId as string | undefined
    const deleted = payload.deleted as boolean | undefined
    const properties = (payload.properties || {}) as Record<string, unknown>

    if (schemaId && deleted !== true) {
      // Has schemaId and not deleted = create
      bus.emit({
        type: 'store:create',
        nodeId,
        schemaId,
        properties,
        lamport: change.lamport,
        duration: 0
      })
    } else if (deleted === true) {
      bus.emit({
        type: 'store:delete',
        nodeId,
        duration: 0
      })
    } else if (deleted === false && !schemaId) {
      bus.emit({
        type: 'store:restore',
        nodeId,
        duration: 0
      })
    } else {
      bus.emit({
        type: 'store:update',
        nodeId,
        properties,
        lamport: change.lamport,
        duration: 0
      })
    }
  })
}

export function instrumentStore(store: NodeStore, bus: DevToolsEventBus): () => void {
  // Listen to all store changes via the existing subscribe mechanism
  const unsubscribe = instrumentChangeFeed((listener) => store.subscribe(listener), bus)

  // Poll for conflicts periodically
  const conflictInterval = setInterval(() => {
    const conflicts = store.getRecentConflicts?.()
    if (conflicts?.length) {
      conflicts.forEach((conflict) => {
        bus.emit({ type: 'store:conflict', conflict })
      })
      store.clearConflicts?.()
    }
  }, DEFAULTS.CONFLICT_POLL_MS)

  return () => {
    unsubscribe()
    clearInterval(conflictInterval)
  }
}
