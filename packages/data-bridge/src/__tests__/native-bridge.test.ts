/**
 * Tests for NativeBridge
 *
 * Note: These tests run in Node.js environment, not React Native.
 * They test the core functionality of NativeBridge that doesn't
 * depend on React Native-specific APIs.
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import {
  NodeStore,
  MemoryNodeStorageAdapter,
  defineSchema,
  text,
  number,
  checkbox
} from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NativeBridge, createNativeBridge, isReactNative, isExpo } from '../native-bridge'

// ─── Test Schema ──────────────────────────────────────────────────────────────

const TestSchema = defineSchema({
  name: 'NativeTestItem',
  namespace: 'xnet://test.native/',
  version: '1.0.0',
  properties: {
    title: text(),
    count: number(),
    active: checkbox()
  }
})

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createTestStore(): NodeStore {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  return new NodeStore({
    authorDID: did,
    signingKey: keyPair.privateKey,
    storage: new MemoryNodeStorageAdapter()
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NativeBridge', () => {
  let store: NodeStore
  let bridge: NativeBridge

  beforeEach(async () => {
    store = createTestStore()
    await store.initialize()
    bridge = createNativeBridge({ store })
  })

  afterEach(() => {
    bridge.destroy()
  })

  describe('initialization', () => {
    it('should create bridge with NodeStore', () => {
      expect(bridge).toBeInstanceOf(NativeBridge)
      expect(bridge.status).toBe('connected')
    })

    it('should provide nodeStore accessor', () => {
      expect(bridge.nodeStore).toBe(store)
    })
  })

  describe('queries', () => {
    it('should return empty array for empty store', async () => {
      const subscription = bridge.query(TestSchema)

      // Wait for async load
      await new Promise((resolve) => setTimeout(resolve, 10))

      const snapshot = subscription.getSnapshot()
      expect(snapshot).toEqual([])
    })

    it('should return created nodes', async () => {
      // Create a node first
      await bridge.create(TestSchema, { title: 'Test', count: 1, active: true })

      // Query
      const subscription = bridge.query(TestSchema)

      // Wait for async load
      await new Promise((resolve) => setTimeout(resolve, 10))

      const snapshot = subscription.getSnapshot()
      expect(snapshot).toHaveLength(1)
      expect(snapshot![0].properties.title).toBe('Test')
    })

    it('should filter by where clause', async () => {
      await bridge.create(TestSchema, { title: 'Active', count: 1, active: true })
      await bridge.create(TestSchema, { title: 'Inactive', count: 2, active: false })

      const subscription = bridge.query(TestSchema, {
        where: { active: true }
      })

      // Wait for async load
      await new Promise((resolve) => setTimeout(resolve, 10))

      const snapshot = subscription.getSnapshot()
      expect(snapshot).toHaveLength(1)
      expect(snapshot![0].properties.title).toBe('Active')
    })

    it('should notify subscribers on changes', async () => {
      const subscription = bridge.query(TestSchema)
      let notifyCount = 0

      subscription.subscribe(() => {
        notifyCount++
      })

      // Create a node
      await bridge.create(TestSchema, { title: 'New', count: 1, active: true })

      // Wait for notification
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(notifyCount).toBeGreaterThan(0)
    })
  })

  describe('mutations', () => {
    it('should create a node', async () => {
      const node = await bridge.create(TestSchema, {
        title: 'Created',
        count: 42,
        active: true
      })

      expect(node).toBeDefined()
      expect(node.properties.title).toBe('Created')
      expect(node.properties.count).toBe(42)
      expect(node.schemaId).toBe(TestSchema._schemaId)
    })

    it('should create a node with custom ID', async () => {
      const customId = 'custom-id-123'
      const node = await bridge.create(
        TestSchema,
        { title: 'Custom ID', count: 1, active: true },
        customId
      )

      expect(node.id).toBe(customId)
    })

    it('should update a node', async () => {
      const created = await bridge.create(TestSchema, {
        title: 'Original',
        count: 1,
        active: true
      })

      const updated = await bridge.update(created.id, {
        title: 'Updated',
        count: 2
      })

      expect(updated.properties.title).toBe('Updated')
      expect(updated.properties.count).toBe(2)
      expect(updated.properties.active).toBe(true) // unchanged
    })

    it('should delete a node', async () => {
      const node = await bridge.create(TestSchema, {
        title: 'To Delete',
        count: 1,
        active: true
      })

      await bridge.delete(node.id)

      const fetched = await bridge.get(node.id)
      expect(fetched?.deleted).toBe(true)
    })

    it('should restore a deleted node', async () => {
      const node = await bridge.create(TestSchema, {
        title: 'To Restore',
        count: 1,
        active: true
      })

      await bridge.delete(node.id)
      const restored = await bridge.restore(node.id)

      expect(restored.deleted).toBeFalsy()
    })
  })

  describe('direct access', () => {
    it('should get a node by ID', async () => {
      const created = await bridge.create(TestSchema, {
        title: 'Get Me',
        count: 1,
        active: true
      })

      const fetched = await bridge.get(created.id)
      expect(fetched).toBeDefined()
      expect(fetched!.properties.title).toBe('Get Me')
    })

    it('should return null for non-existent node', async () => {
      const fetched = await bridge.get('non-existent-id')
      expect(fetched).toBeNull()
    })

    it('should list nodes', async () => {
      await bridge.create(TestSchema, { title: 'One', count: 1, active: true })
      await bridge.create(TestSchema, { title: 'Two', count: 2, active: false })

      const nodes = await bridge.list({ schemaId: TestSchema._schemaId })
      expect(nodes).toHaveLength(2)
    })

    it('should subscribe to changes', async () => {
      let changeCount = 0
      const unsubscribe = bridge.subscribeToChanges!(() => {
        changeCount++
      })

      await bridge.create(TestSchema, { title: 'Change', count: 1, active: true })

      expect(changeCount).toBeGreaterThan(0)
      unsubscribe()
    })
  })

  describe('documents', () => {
    it('should throw error for acquireDoc (not implemented)', async () => {
      await expect(bridge.acquireDoc('some-id')).rejects.toThrow(
        'Y.Doc editing is not yet supported in NativeBridge'
      )
    })

    it('should no-op for releaseDoc', () => {
      // Should not throw
      expect(() => bridge.releaseDoc('some-id')).not.toThrow()
    })
  })

  describe('status', () => {
    it('should be connected by default', () => {
      expect(bridge.status).toBe('connected')
    })

    it('should support status listeners', () => {
      const statuses: string[] = []
      const unsubscribe = bridge.on('status', (status) => {
        statuses.push(status)
      })

      // Status doesn't change in current implementation
      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })
  })

  describe('lifecycle', () => {
    it('should destroy cleanly', () => {
      const testBridge = createNativeBridge({ store })
      expect(() => testBridge.destroy()).not.toThrow()
    })

    it('should reject operations after destroy', async () => {
      bridge.destroy()

      await expect(
        bridge.create(TestSchema, { title: 'Test', count: 1, active: true })
      ).rejects.toThrow('NativeBridge has been destroyed')
    })
  })
})

describe('platform detection', () => {
  it('isReactNative should return false in Node.js', () => {
    expect(isReactNative()).toBe(false)
  })

  it('isExpo should return false in Node.js', () => {
    expect(isExpo()).toBe(false)
  })
})
