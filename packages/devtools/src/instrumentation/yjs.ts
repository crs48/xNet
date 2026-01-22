/**
 * Yjs Y.Doc instrumentation
 *
 * Observes Y.Doc updates and meta map changes, emitting DevTools events
 * for real-time CRDT inspection.
 */

import type * as Y from 'yjs'
import type { DevToolsEventBus } from '../core/event-bus'

export function instrumentYDoc(doc: Y.Doc, docId: string, bus: DevToolsEventBus): () => void {
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    bus.emit({
      type: 'yjs:update',
      docId,
      updateSize: update.byteLength,
      origin: origin != null ? String(origin) : null,
      isLocal: origin === null || origin === 'local'
    })
  }

  // Observe meta map if it exists
  let metaMap: Y.Map<unknown> | null = null
  let metaObserver: ((event: Y.YMapEvent<unknown>) => void) | null = null

  try {
    metaMap = doc.getMap('meta')
    metaObserver = (event: Y.YMapEvent<unknown>) => {
      bus.emit({
        type: 'yjs:meta-change',
        docId,
        keysChanged: Array.from(event.keysChanged),
        origin: event.transaction.origin != null ? String(event.transaction.origin) : null,
        isLocal: event.transaction.origin === null || event.transaction.origin === 'local'
      })
    }
    metaMap.observe(metaObserver)
  } catch {
    // Meta map may not exist, that's fine
  }

  doc.on('update', onUpdate)

  return () => {
    doc.off('update', onUpdate)
    if (metaMap && metaObserver) {
      metaMap.unobserve(metaObserver)
    }
  }
}
