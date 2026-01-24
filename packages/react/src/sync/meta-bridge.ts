/**
 * Meta Bridge - Bridges Y.Doc meta map changes to the NodeStore
 *
 * When a remote peer updates a Node's properties via the Y.Doc meta map,
 * this observer applies those changes to the local NodeStore so that
 * useQuery subscriptions (e.g., sidebar list) reflect the update.
 *
 * Extracted from useNode's inline logic to enable reuse by the
 * Background Sync Manager (BSM).
 */

import * as Y from 'yjs'
import type { NodeStore } from '@xnet/data'

export interface MetaBridge {
  /** Start observing a Y.Doc's meta map for a given Node */
  observe(nodeId: string, doc: Y.Doc): () => void
  /** Apply current meta map state to NodeStore (for initial sync) */
  applyNow(nodeId: string, doc: Y.Doc): Promise<void>
}

export function createMetaBridge(store: NodeStore): MetaBridge {
  function applyMetaToNodeStore(nodeId: string, metaMap: Y.Map<unknown>): Promise<void> {
    if (metaMap.size === 0) return Promise.resolve()

    const props: Record<string, unknown> = {}
    metaMap.forEach((value, key) => {
      // Skip internal keys (_schemaId is a system field, not a property)
      if (key.startsWith('_')) return
      props[key] = value
    })

    if (Object.keys(props).length === 0) return Promise.resolve()

    return store
      .update(nodeId, { properties: props })
      .then(() => {})
      .catch((err) => {
        console.warn(`[MetaBridge] Failed to apply meta for ${nodeId}:`, err)
      })
  }

  return {
    observe(nodeId: string, doc: Y.Doc): () => void {
      const metaMap = doc.getMap('meta')

      const observer = (event: Y.YMapEvent<unknown>) => {
        // Only process remote changes (not local edits)
        if (event.transaction.origin !== null && event.transaction.origin !== 'local') {
          applyMetaToNodeStore(nodeId, metaMap)
        }
      }

      metaMap.observe(observer)
      return () => metaMap.unobserve(observer)
    },

    async applyNow(nodeId: string, doc: Y.Doc): Promise<void> {
      const metaMap = doc.getMap('meta')
      await applyMetaToNodeStore(nodeId, metaMap)
    }
  }
}
