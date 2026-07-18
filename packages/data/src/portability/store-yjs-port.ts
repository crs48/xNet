/**
 * A BundleYjsPort backed by the store's per-node CRDT document content
 * (`yjs_state` via get/setDocumentContent) — exploration 0344.
 *
 * Import merges by Yjs state vector (never re-applies a rebuilt doc, which
 * would duplicate blocks — see the seed runner's create-once rule). Stored
 * content that is not a plain Yjs update (e.g. an encrypted snapshot
 * wrapper) is transferred create-once and never merged blindly.
 */

import * as Y from 'yjs'
import type { NodeStore } from '../store/store'
import type { NodeId } from '../store/types'
import type { BundleYjsPort } from './types'

export function createStoreYjsPort(store: NodeStore): BundleYjsPort {
  return {
    async *list() {
      const nodes = await store.list({ includeDeleted: true })
      for (const node of nodes) {
        const content = await store.getDocumentContent(node.id)
        if (content && content.byteLength > 0) {
          yield { nodeId: node.id, update: content }
        }
      }
    },

    async apply(nodeId: string, update: Uint8Array): Promise<void> {
      const existing = await store.getDocumentContent(nodeId as NodeId)
      if (!existing || existing.byteLength === 0) {
        await store.setDocumentContent(nodeId as NodeId, update)
        return
      }
      // Merge by state vector. If either side is not a decodable Yjs update
      // (encrypted wrapper, foreign CRDT), refuse rather than corrupt —
      // applyBundle quarantines the doc with this reason.
      let merged: Uint8Array
      const doc = new Y.Doc()
      try {
        Y.applyUpdate(doc, existing)
        Y.applyUpdate(doc, update)
        merged = Y.encodeStateAsUpdate(doc)
      } catch (err) {
        throw new Error(
          `document content for ${nodeId} is not a mergeable Yjs update (${(err as Error).message}); ` +
            'left the existing content untouched'
        )
      } finally {
        doc.destroy()
      }
      await store.setDocumentContent(nodeId as NodeId, merged)
    }
  }
}
