# 01: Meta Bridge

> Extract the meta-map-to-NodeStore sync logic into a reusable utility

**Dependencies:** None (refactor of existing code)
**Modifies:** `packages/react/src/hooks/useDocument.ts`, new `packages/react/src/sync/meta-bridge.ts`

## Overview

Currently, `useNode` contains inline logic (`applyMetaToNodeStore`) that bridges Y.Doc meta map changes to the NodeStore. This logic is buried inside the hook's effect and only runs while the component is mounted.

Extracting it into a standalone utility enables:

1. The BSM to reuse it for background-synced Nodes
2. Cleaner separation of concerns in `useNode`
3. Testing the meta bridge in isolation

## Implementation

### 1. Meta Bridge Utility

```typescript
// packages/react/src/sync/meta-bridge.ts

import * as Y from 'yjs'
import type { NodeStore } from '@xnetjs/data'

/**
 * Bridges Y.Doc meta map changes to the NodeStore.
 *
 * When a remote peer updates a Node's properties via the meta map,
 * this observer applies those changes to the local NodeStore so that
 * useQuery subscriptions (e.g., sidebar) reflect the update.
 */
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
```

### 2. Update useNode to Use MetaBridge

```typescript
// packages/react/src/hooks/useDocument.ts (changes)

import { createMetaBridge } from '../sync/meta-bridge'

// Inside the sync effect, replace inline applyMetaToNodeStore with:
const metaBridge = createMetaBridge(storeRef.current!)

// On sync connect:
const unobserveMeta = metaBridge.observe(id, doc)

// On synced:
const syncedHandler = (event: unknown) => {
  const { synced } = event as { synced: boolean }
  if (synced) {
    metaBridge.applyNow(id, doc)
  }
}

// Cleanup:
return () => {
  unobserveMeta()
  // ... rest of cleanup
}
```

## Tests

```typescript
// packages/react/src/sync/meta-bridge.test.ts

import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'
import { createMetaBridge } from './meta-bridge'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'

describe('MetaBridge', () => {
  it('should apply remote meta changes to NodeStore', async () => {
    const storage = new MemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage,
      authorDID: 'did:key:test',
      signingKey: new Uint8Array(32)
    })
    await store.initialize()

    // Create a node
    const node = await store.create({
      schemaId: 'xnet://xnet.dev/Page',
      properties: { title: 'Original' }
    })

    // Set up meta bridge
    const bridge = createMetaBridge(store)
    const doc = new Y.Doc({ guid: node.id })

    const unobserve = bridge.observe(node.id, doc)

    // Simulate remote meta change (origin is not null and not 'local')
    doc.transact(() => {
      doc.getMap('meta').set('title', 'Updated by Peer')
    }, 'remote-provider')

    // Wait for async store update
    await new Promise((r) => setTimeout(r, 50))

    const updated = await store.get(node.id)
    expect(updated?.properties.title).toBe('Updated by Peer')

    unobserve()
  })

  it('should skip local changes', async () => {
    const storage = new MemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage,
      authorDID: 'did:key:test',
      signingKey: new Uint8Array(32)
    })
    await store.initialize()

    const node = await store.create({
      schemaId: 'xnet://xnet.dev/Page',
      properties: { title: 'Original' }
    })

    const bridge = createMetaBridge(store)
    const doc = new Y.Doc({ guid: node.id })

    const updateSpy = vi.spyOn(store, 'update')
    const unobserve = bridge.observe(node.id, doc)

    // Local change (origin = 'local') — should NOT trigger store update
    doc.transact(() => {
      doc.getMap('meta').set('title', 'Local Edit')
    }, 'local')

    await new Promise((r) => setTimeout(r, 50))
    expect(updateSpy).not.toHaveBeenCalled()

    unobserve()
  })

  it('should skip _schemaId from properties', async () => {
    const storage = new MemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage,
      authorDID: 'did:key:test',
      signingKey: new Uint8Array(32)
    })
    await store.initialize()

    const node = await store.create({
      schemaId: 'xnet://xnet.dev/Page',
      properties: { title: 'Test' }
    })

    const bridge = createMetaBridge(store)
    const doc = new Y.Doc({ guid: node.id })

    const unobserve = bridge.observe(node.id, doc)

    doc.transact(() => {
      const meta = doc.getMap('meta')
      meta.set('_schemaId', 'xnet://xnet.dev/Page')
      meta.set('title', 'New Title')
    }, 'remote')

    await new Promise((r) => setTimeout(r, 50))

    const updated = await store.get(node.id)
    expect(updated?.properties.title).toBe('New Title')
    expect(updated?.properties._schemaId).toBeUndefined()

    unobserve()
  })
})
```

## Checklist

- [ ] Create `packages/react/src/sync/meta-bridge.ts`
- [ ] Write unit tests for MetaBridge
- [ ] Refactor `useNode` to use `createMetaBridge()` instead of inline logic
- [ ] Verify existing behavior unchanged (sidebar reactivity still works)
- [ ] Export `createMetaBridge` from package (for BSM use in later steps)

---

[Next: Node Pool →](./02-node-pool.md)
