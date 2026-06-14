/**
 * Web wiring for the Lab runtime ladder (exploration 0180).
 *
 * Builds the ladder used by `LabView`, lazily backing the TypeScript transpiler
 * with `@swc/wasm-web` (browser-only, initialized on first use), and adapts the
 * app's `NodeStore` into the permission-gated `LabStore` the host bridge needs.
 */

import type { NodeStore } from '@xnetjs/data'
import type { LabStore, Transpiler } from '@xnetjs/labs'
import {
  RuntimeLadder,
  createDefaultLadder,
  createSwcTranspiler,
  identityTranspiler
} from '@xnetjs/labs'

let swcReady: Promise<Transpiler> | null = null

/**
 * A transpiler that lazily loads + initializes `@swc/wasm-web` the first time a
 * TypeScript Lab runs. Falls back to the identity transpiler (JS passthrough)
 * if the WASM module cannot load, so JavaScript Labs always work.
 */
function lazySwcTranspiler(): Transpiler {
  return {
    async transpile(code, language) {
      if (language !== 'typescript') return identityTranspiler.transpile(code, language)
      if (!swcReady) {
        swcReady = (async () => {
          const swc = await import('@swc/wasm-web')
          await swc.default()
          return createSwcTranspiler({
            transformSync: (source, options) =>
              swc.transformSync(source, options as Parameters<typeof swc.transformSync>[1])
          })
        })().catch(() => identityTranspiler)
      }
      const transpiler = await swcReady
      return transpiler.transpile(code, language)
    }
  }
}

/** Build the standard ladder for the web app (SES + QuickJS + App + Python). */
export function createWebLabLadder(): RuntimeLadder {
  return createDefaultLadder({ transpiler: lazySwcTranspiler() })
}

/** Adapt a NodeStore into the read-only LabStore the host bridge consumes. */
export function labStoreFromNodeStore(store: NodeStore): LabStore {
  return {
    // NodeStore uses branded SchemaIRI/NodeId template types; the LabStore
    // surface is plain strings, so cast at the boundary.
    list: async ({ schemaId, limit, offset }) => {
      const nodes = await store.list({ schemaId: schemaId as never, limit, offset })
      return nodes.map((node) => ({
        id: node.id,
        schemaId: node.schemaId,
        properties: node.properties
      }))
    },
    get: async (id) => {
      const node = await store.get(id as never)
      return node
        ? { id: node.id, schemaId: node.schemaId, properties: node.properties }
        : null
    }
  }
}
