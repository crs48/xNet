/**
 * NodeStore instrumentation
 *
 * Subscribes to the NodeStore's change events and emits typed DevTools events
 * for creates, updates, deletes, restores, remote changes, and conflicts.
 */

import type { DevToolsEventBus } from '../core/event-bus'
import type { NodeStore, NodeChangeEvent } from '@xnet/data'
import { DEFAULTS } from '../core/constants'

export function instrumentStore(store: NodeStore, bus: DevToolsEventBus): () => void {
  // Listen to all store changes via the existing subscribe mechanism
  const unsubscribe = store.subscribe((event: NodeChangeEvent) => {
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
