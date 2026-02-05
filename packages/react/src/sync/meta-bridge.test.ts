/**
 * Tests for MetaBridge (Unidirectional: NodeStore → Y.Doc meta)
 *
 * SECURITY: These tests verify that MetaBridge is one-way only.
 * Malicious Y.Doc meta changes must NOT reach the NodeStore.
 */

import type { NodeStore, NodeChangeEvent, NodeChange } from '@xnet/data'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Y from 'yjs'
import {
  createMetaBridge,
  METABRIDGE_ORIGIN,
  METABRIDGE_SEED_ORIGIN,
  type MetaBridge
} from './meta-bridge'

// Mock NodeStore
interface MockNodeStoreData {
  nodes: Map<string, { properties: Record<string, unknown> }>
  listeners: Set<(event: NodeChangeEvent) => void>
}

function createMockNodeStore(): NodeStore & {
  _data: MockNodeStoreData
  _emitChange: (nodeId: string, properties: Record<string, unknown>) => void
} {
  const data: MockNodeStoreData = {
    nodes: new Map(),
    listeners: new Set()
  }

  const store = {
    _data: data,

    async get(nodeId: string) {
      return data.nodes.get(nodeId) ?? null
    },

    subscribe(listener: (event: NodeChangeEvent) => void) {
      data.listeners.add(listener)
      return () => {
        data.listeners.delete(listener)
      }
    },

    // Helper to simulate a NodeStore change event
    _emitChange(nodeId: string, properties: Record<string, unknown>) {
      // Update internal state
      const existing = data.nodes.get(nodeId)
      if (existing) {
        existing.properties = { ...existing.properties, ...properties }
      } else {
        data.nodes.set(nodeId, { properties })
      }

      // Emit to listeners
      const event: NodeChangeEvent = {
        change: {
          payload: {
            nodeId,
            properties
          }
        } as NodeChange,
        node: data.nodes.get(nodeId) as any,
        isRemote: false
      }

      for (const listener of data.listeners) {
        listener(event)
      }
    }
  } as any

  return store
}

describe('MetaBridge (unidirectional)', () => {
  let store: ReturnType<typeof createMockNodeStore>
  let bridge: MetaBridge
  let doc: Y.Doc
  const nodeId = 'test-node-123'

  beforeEach(() => {
    store = createMockNodeStore()
    bridge = createMetaBridge(store, { warnOnExternalMetaChanges: false })
    doc = new Y.Doc({ guid: nodeId })
  })

  describe('observe (NodeStore → Y.Doc)', () => {
    it('propagates NodeStore changes to Y.Doc meta map', () => {
      bridge.observe(nodeId, doc)

      store._emitChange(nodeId, { title: 'Hello World' })

      expect(doc.getMap('meta').get('title')).toBe('Hello World')
    })

    it('propagates multiple properties', () => {
      bridge.observe(nodeId, doc)

      store._emitChange(nodeId, { title: 'Test', status: 'draft', priority: 1 })

      const meta = doc.getMap('meta')
      expect(meta.get('title')).toBe('Test')
      expect(meta.get('status')).toBe('draft')
      expect(meta.get('priority')).toBe(1)
    })

    it('propagates incremental changes', () => {
      bridge.observe(nodeId, doc)

      store._emitChange(nodeId, { title: 'First' })
      store._emitChange(nodeId, { status: 'done' })

      const meta = doc.getMap('meta')
      expect(meta.get('title')).toBe('First')
      expect(meta.get('status')).toBe('done')
    })

    it('ignores changes for other nodes', () => {
      bridge.observe(nodeId, doc)

      store._emitChange('other-node', { title: 'Other' })

      expect(doc.getMap('meta').get('title')).toBeUndefined()
    })

    it('skips internal properties (starting with _)', () => {
      bridge.observe(nodeId, doc)

      store._emitChange(nodeId, { title: 'Public', _internal: 'secret' })

      const meta = doc.getMap('meta')
      expect(meta.get('title')).toBe('Public')
      expect(meta.get('_internal')).toBeUndefined()
    })

    it('uses METABRIDGE_ORIGIN for transaction origin', () => {
      bridge.observe(nodeId, doc)

      const origins: (string | null)[] = []
      doc.getMap('meta').observe((_, tx) => {
        origins.push(tx.origin as string | null)
      })

      store._emitChange(nodeId, { title: 'Test' })

      expect(origins).toContain(METABRIDGE_ORIGIN)
    })

    it('unsubscribe stops propagation', () => {
      const unsubscribe = bridge.observe(nodeId, doc)

      store._emitChange(nodeId, { title: 'Before' })
      expect(doc.getMap('meta').get('title')).toBe('Before')

      unsubscribe()

      store._emitChange(nodeId, { title: 'After' })
      expect(doc.getMap('meta').get('title')).toBe('Before') // unchanged
    })
  })

  describe('seed', () => {
    it('populates meta map with current NodeStore state', async () => {
      store._data.nodes.set(nodeId, {
        properties: { title: 'Initial', status: 'draft' }
      })

      await bridge.seed(nodeId, doc)

      const meta = doc.getMap('meta')
      expect(meta.get('title')).toBe('Initial')
      expect(meta.get('status')).toBe('draft')
    })

    it('handles non-existent node gracefully', async () => {
      await expect(bridge.seed('nonexistent', doc)).resolves.not.toThrow()
      expect(doc.getMap('meta').size).toBe(0)
    })

    it('handles node with no properties', async () => {
      store._data.nodes.set(nodeId, { properties: {} })

      await bridge.seed(nodeId, doc)

      expect(doc.getMap('meta').size).toBe(0)
    })

    it('uses METABRIDGE_SEED_ORIGIN for transaction origin', async () => {
      store._data.nodes.set(nodeId, { properties: { title: 'Test' } })

      const origins: (string | null)[] = []
      doc.getMap('meta').observe((_, tx) => {
        origins.push(tx.origin as string | null)
      })

      await bridge.seed(nodeId, doc)

      expect(origins).toContain(METABRIDGE_SEED_ORIGIN)
    })

    it('skips internal properties', async () => {
      store._data.nodes.set(nodeId, {
        properties: { title: 'Public', _schemaId: 'internal' }
      })

      await bridge.seed(nodeId, doc)

      const meta = doc.getMap('meta')
      expect(meta.get('title')).toBe('Public')
      expect(meta.get('_schemaId')).toBeUndefined()
    })
  })

  describe('applyNow (backward compatibility)', () => {
    it('is an alias for seed()', async () => {
      store._data.nodes.set(nodeId, { properties: { title: 'Test' } })

      await bridge.applyNow(nodeId, doc)

      expect(doc.getMap('meta').get('title')).toBe('Test')
    })
  })

  describe('SECURITY: Y.Doc → NodeStore is BLOCKED', () => {
    it('does NOT propagate Y.Doc meta changes to NodeStore', async () => {
      // Set up initial state
      store._data.nodes.set(nodeId, { properties: { title: 'Original' } })
      bridge.observe(nodeId, doc)
      await bridge.seed(nodeId, doc)

      // Verify initial state
      expect(store._data.nodes.get(nodeId)?.properties.title).toBe('Original')
      expect(doc.getMap('meta').get('title')).toBe('Original')

      // Simulate malicious Yjs update targeting meta map
      doc.transact(() => {
        doc.getMap('meta').set('title', 'HACKED')
      }, 'remote-peer')

      // Y.Doc meta was changed (this is expected - CRDTs accept all updates)
      expect(doc.getMap('meta').get('title')).toBe('HACKED')

      // BUT NodeStore should be UNCHANGED (this is the security property)
      expect(store._data.nodes.get(nodeId)?.properties.title).toBe('Original')
    })

    it('does NOT propagate ANY remote meta changes to NodeStore', async () => {
      store._data.nodes.set(nodeId, { properties: {} })
      bridge.observe(nodeId, doc)

      // Attacker injects new property via Yjs
      doc.transact(() => {
        doc.getMap('meta').set('malicious', 'payload')
      }, 'attacker')

      // NodeStore should have no malicious property
      expect(store._data.nodes.get(nodeId)?.properties.malicious).toBeUndefined()
    })
  })

  describe('external meta change monitoring', () => {
    it('logs warning for non-MetaBridge meta changes', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Create bridge with warnings enabled
      const warnBridge = createMetaBridge(store, { warnOnExternalMetaChanges: true })
      warnBridge.observe(nodeId, doc)

      // Simulate external change
      doc.transact(() => {
        doc.getMap('meta').set('title', 'External')
      }, 'attacker')

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('non-MetaBridge source'),
        expect.objectContaining({
          nodeId,
          keys: ['title'],
          origin: 'attacker'
        })
      )

      warnSpy.mockRestore()
    })

    it('does not warn for MetaBridge-originated changes', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const warnBridge = createMetaBridge(store, { warnOnExternalMetaChanges: true })
      warnBridge.observe(nodeId, doc)

      // Legitimate change through NodeStore
      store._emitChange(nodeId, { title: 'Legitimate' })

      expect(warnSpy).not.toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    it('does not warn for local changes (null origin)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const warnBridge = createMetaBridge(store, { warnOnExternalMetaChanges: true })
      warnBridge.observe(nodeId, doc)

      // Local change (e.g., from editor before mutate call)
      doc.transact(() => {
        doc.getMap('meta').set('title', 'Local')
      }) // null origin

      expect(warnSpy).not.toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    it('does not warn when monitoring is disabled', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Default: warnings disabled
      bridge.observe(nodeId, doc)

      doc.transact(() => {
        doc.getMap('meta').set('title', 'External')
      }, 'attacker')

      expect(warnSpy).not.toHaveBeenCalled()

      warnSpy.mockRestore()
    })
  })

  describe('integration: correct flow for property updates', () => {
    it('NodeStore changes sync to Y.Doc for display', () => {
      bridge.observe(nodeId, doc)

      // Simulate mutate() updating NodeStore
      store._emitChange(nodeId, { title: 'Updated via mutate' })

      // Editor can read from meta map for display
      expect(doc.getMap('meta').get('title')).toBe('Updated via mutate')
    })

    it('editor reads from Y.Doc meta, writes through mutate (mocked)', () => {
      bridge.observe(nodeId, doc)
      store._emitChange(nodeId, { title: 'Initial' })

      // Editor reads for display
      const displayTitle = doc.getMap('meta').get('title')
      expect(displayTitle).toBe('Initial')

      // Editor writes through mutate (simulated by _emitChange)
      // In real code: mutate(nodeId, { title: newTitle })
      store._emitChange(nodeId, { title: 'New Title' })

      // MetaBridge propagates to Y.Doc for other peers
      expect(doc.getMap('meta').get('title')).toBe('New Title')
    })
  })
})
