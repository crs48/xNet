/**
 * Yjs Y.Doc instrumentation
 *
 * Observes Y.Doc updates and meta map changes, emitting DevTools events
 * for real-time CRDT inspection.
 */

import type * as Y from 'yjs'
import type { DevToolsEventBus } from '../core/event-bus'
import type { YDocRegistry } from '../provider/DevToolsContext'

function formatOrigin(origin: unknown): string | null {
  if (origin == null) return null
  if (typeof origin === 'string') return origin
  if (typeof origin === 'object') {
    // Try to get a meaningful name from the object
    const name = (origin as Record<string, unknown>).constructor?.name
    if (name && name !== 'Object') return name
    // For plain objects, try to serialize briefly
    try {
      const json = JSON.stringify(origin)
      return json.length > 50 ? json.slice(0, 47) + '...' : json
    } catch {
      return '[object]'
    }
  }
  return String(origin)
}

export function instrumentYDoc(
  doc: Y.Doc,
  docId: string,
  bus: DevToolsEventBus,
  registry?: YDocRegistry
): () => void {
  // Register doc for tree inspection
  registry?.register(docId, doc)
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    bus.emit({
      type: 'yjs:update',
      docId,
      updateSize: update.byteLength,
      origin: formatOrigin(origin),
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
        origin: formatOrigin(event.transaction.origin),
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
    registry?.unregister(docId)
  }
}
