/**
 * Meta Bridge - Unidirectional sync from NodeStore → Y.Doc meta map
 *
 * SECURITY: This bridge is intentionally ONE-WAY. The Y.Doc meta map is a
 * read-only cache for the editor UI. Property changes MUST go through the
 * signed NodeChange pipeline (via mutate()), never through Yjs.
 *
 * Before (VULNERABLE):
 *   NodeStore ↔ MetaBridge ↔ Y.Doc meta
 *   (Malicious Yjs updates could poison NodeStore!)
 *
 * After (SECURE):
 *   NodeStore → MetaBridge → Y.Doc meta (write)
 *   Y.Doc meta → Editor UI (read-only display)
 *   Editor UI → mutate() → NodeStore (signed writes)
 *
 * See: docs/plans/plan03_4_1YjsSecurity/04-metabridge-isolation.md
 */

import type { NodeStore, NodeChangeEvent } from '@xnetjs/data'
import * as Y from 'yjs'

/** Transaction origin for MetaBridge writes (for debugging/monitoring) */
export const METABRIDGE_ORIGIN = 'metabridge'
export const METABRIDGE_SEED_ORIGIN = 'metabridge-seed'

export interface MetaBridge {
  /**
   * Start observing NodeStore changes for a Node and syncing to Y.Doc meta.
   * Direction: NodeStore → Y.Doc meta map (ONE-WAY)
   *
   * @returns Unsubscribe function
   */
  observe(nodeId: string, doc: Y.Doc): () => void

  /**
   * Seed the Y.Doc meta map with current NodeStore state.
   * Called on document open to populate editor UI.
   */
  seed(nodeId: string, doc: Y.Doc): Promise<void>

  /**
   * @deprecated Use seed() instead. applyNow() was the bidirectional API.
   * This is kept for backward compatibility but now just calls seed().
   */
  applyNow(nodeId: string, doc: Y.Doc): Promise<void>
}

/**
 * Create a unidirectional MetaBridge.
 *
 * @param store - NodeStore to observe
 * @param options - Configuration options
 */
export function createMetaBridge(
  store: NodeStore,
  options?: {
    /** Log warnings for non-MetaBridge meta map changes (default: true) */
    warnOnExternalMetaChanges?: boolean
  }
): MetaBridge {
  const warnOnExternal = options?.warnOnExternalMetaChanges ?? true

  /**
   * Write NodeStore properties to Y.Doc meta map.
   * Uses transaction origin for tracing/debugging.
   */
  function writePropertiesToMeta(
    doc: Y.Doc,
    properties: Record<string, unknown>,
    origin: string
  ): void {
    const metaMap = doc.getMap('meta')

    doc.transact(() => {
      for (const [key, value] of Object.entries(properties)) {
        // Skip internal keys (system fields, not display properties)
        if (key.startsWith('_')) continue
        metaMap.set(key, value)
      }
    }, origin)
  }

  /**
   * Set up monitoring for external meta map changes (for debugging).
   * These changes are NOT propagated to NodeStore — they're logged as warnings.
   */
  function setupMetaMonitor(doc: Y.Doc, nodeId: string): () => void {
    if (!warnOnExternal) return () => {}

    const metaMap = doc.getMap('meta')

    const observer = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
      const origin = transaction.origin

      // Ignore our own writes
      if (origin === METABRIDGE_ORIGIN || origin === METABRIDGE_SEED_ORIGIN) {
        return
      }

      // Ignore local user edits (null origin typically means local)
      if (origin === null || origin === 'local') {
        return
      }

      // This is a remote Yjs update targeting the meta map — log it
      const changedKeys = Array.from(event.changes.keys.keys())
      console.warn(
        `[MetaBridge] Meta map change from non-MetaBridge source (BLOCKED from NodeStore):`,
        {
          nodeId,
          keys: changedKeys,
          origin,
          hint: 'Property changes should go through mutate(), not Y.Doc meta map'
        }
      )
    }

    metaMap.observe(observer)
    return () => metaMap.unobserve(observer)
  }

  return {
    observe(nodeId: string, doc: Y.Doc): () => void {
      // Set up NodeStore → Y.Doc meta direction
      const unsubscribeStore = store.subscribe((event: NodeChangeEvent) => {
        // Only process changes for this node
        if (event.change.payload.nodeId !== nodeId) return

        // Only process changes with properties
        const properties = event.change.payload.properties
        if (!properties || Object.keys(properties).length === 0) return

        // Write properties to Y.Doc meta map
        writePropertiesToMeta(doc, properties, METABRIDGE_ORIGIN)
      })

      // Set up monitoring for external meta changes (for debugging)
      const unsubscribeMonitor = setupMetaMonitor(doc, nodeId)

      // Return combined unsubscribe
      return () => {
        unsubscribeStore()
        unsubscribeMonitor()
      }
    },

    async seed(nodeId: string, doc: Y.Doc): Promise<void> {
      const node = await store.get(nodeId)
      if (!node) return

      const properties = node.properties
      if (!properties || Object.keys(properties).length === 0) return

      writePropertiesToMeta(doc, properties, METABRIDGE_SEED_ORIGIN)
    },

    // Backward compatibility alias
    async applyNow(nodeId: string, doc: Y.Doc): Promise<void> {
      return this.seed(nodeId, doc)
    }
  }
}
