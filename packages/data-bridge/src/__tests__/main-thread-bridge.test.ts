/**
 * Tests for MainThreadBridge
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import {
  MemoryNodeStorageAdapter,
  NodeStore,
  defineSchema,
  text,
  checkbox,
  number
} from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MainThreadBridge, createMainThreadBridge } from '../main-thread-bridge'

// ─── Test Schema ─────────────────────────────────────────────────────────────

const TestTaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://test.local/',
  version: '1.0.0',
  properties: {
    title: text({ required: true }),
    done: checkbox()
  }
})

const TestSpatialCardSchema = defineSchema({
  name: 'SpatialCard',
  namespace: 'xnet://test.local/',
  version: '1.0.0',
  properties: {
    title: text({ required: true }),
    x: number({ required: true }),
    y: number({ required: true }),
    width: number({}),
    height: number({})
  }
})

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createTestStore(): {
  store: NodeStore
  adapter: MemoryNodeStorageAdapter
  did: DID
  privateKey: Uint8Array
} {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey
  })
  return { store, adapter, did, privateKey: keyPair.privateKey }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MainThreadBridge', () => {
  let store: NodeStore
  let bridge: MainThreadBridge

  beforeEach(async () => {
    const testStore = createTestStore()
    store = testStore.store
    await store.initialize()
    bridge = new MainThreadBridge(store)
  })

  describe('factory function', () => {
    it('should create a bridge using createMainThreadBridge', () => {
      const newBridge = createMainThreadBridge(store)
      expect(newBridge).toBeInstanceOf(MainThreadBridge)
    })
  })

  describe('query', () => {
    it('should return empty array for empty store', async () => {
      const subscription = bridge.query(TestTaskSchema)

      // Wait for async load
      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).not.toBeNull()
      })

      expect(subscription.getSnapshot()).toEqual([])
    })

    it('should return nodes after creation', async () => {
      // Create a node
      await bridge.create(TestTaskSchema, { title: 'Test Task' })

      const subscription = bridge.query(TestTaskSchema)

      // Wait for async load
      await vi.waitFor(() => {
        const snapshot = subscription.getSnapshot()
        if (snapshot === null || snapshot.length === 0) {
          throw new Error('Waiting for snapshot')
        }
      })

      const snapshot = subscription.getSnapshot()
      expect(snapshot).toHaveLength(1)
      expect(snapshot![0].properties.title).toBe('Test Task')
    })

    it('should notify subscribers on changes', async () => {
      const subscription = bridge.query(TestTaskSchema)
      const callback = vi.fn()

      // Wait for initial load
      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).not.toBeNull()
      })

      // Subscribe
      const unsubscribe = subscription.subscribe(callback)

      // Create a node
      await bridge.create(TestTaskSchema, { title: 'New Task' })

      // Wait for callback to be called
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled()
      })

      // Cleanup
      unsubscribe()
    })

    it('should filter by where clause', async () => {
      // Create nodes
      await bridge.create(TestTaskSchema, { title: 'Task 1', done: false })
      await bridge.create(TestTaskSchema, { title: 'Task 2', done: true })
      await bridge.create(TestTaskSchema, { title: 'Task 3', done: false })

      const subscription = bridge.query(TestTaskSchema, {
        where: { done: true }
      })

      // Wait for async load
      await vi.waitFor(() => {
        const snapshot = subscription.getSnapshot()
        if (snapshot === null || snapshot.length === 0) {
          throw new Error('Waiting for snapshot')
        }
      })

      const snapshot = subscription.getSnapshot()
      expect(snapshot).toHaveLength(1)
      expect(snapshot![0].properties.title).toBe('Task 2')
    })

    it('should avoid notifying filtered queries for unrelated changes', async () => {
      const subscription = bridge.query(TestTaskSchema, {
        where: { done: true }
      })
      const callback = vi.fn()

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).not.toBeNull()
      })

      const unsubscribe = subscription.subscribe(callback)

      await bridge.create(TestTaskSchema, { title: 'Open task', done: false })
      await new Promise((resolve) => setTimeout(resolve, 25))

      expect(subscription.getSnapshot()).toEqual([])
      expect(callback).not.toHaveBeenCalled()

      unsubscribe()
    })

    it('should sort by orderBy', async () => {
      // Create nodes
      await bridge.create(TestTaskSchema, { title: 'B Task' })
      await bridge.create(TestTaskSchema, { title: 'A Task' })
      await bridge.create(TestTaskSchema, { title: 'C Task' })

      const subscription = bridge.query(TestTaskSchema, {
        orderBy: { title: 'asc' }
      })

      // Wait for async load
      await vi.waitFor(() => {
        const snapshot = subscription.getSnapshot()
        if (snapshot === null || snapshot.length !== 3) {
          throw new Error('Waiting for 3 items in snapshot')
        }
      })

      const snapshot = subscription.getSnapshot()
      expect(snapshot![0].properties.title).toBe('A Task')
      expect(snapshot![1].properties.title).toBe('B Task')
      expect(snapshot![2].properties.title).toBe('C Task')
    })

    it('should filter nodes with spatial window queries', async () => {
      await bridge.create(TestSpatialCardSchema, {
        title: 'Visible',
        x: 24,
        y: 36,
        width: 96,
        height: 48
      })
      await bridge.create(TestSpatialCardSchema, {
        title: 'Offscreen',
        x: 520,
        y: 540,
        width: 96,
        height: 48
      })

      const subscription = bridge.query(TestSpatialCardSchema, {
        spatial: {
          kind: 'window',
          rect: { x: 0, y: 0, width: 240, height: 220 },
          fields: { x: 'x', y: 'y', width: 'width', height: 'height' }
        }
      })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Visible'
        ])
      })
    })

    it('should update spatial queries when nodes move into the active window', async () => {
      const visible = await bridge.create(TestSpatialCardSchema, {
        title: 'Visible',
        x: 24,
        y: 36,
        width: 96,
        height: 48
      })
      const offscreen = await bridge.create(TestSpatialCardSchema, {
        title: 'Offscreen',
        x: 520,
        y: 540,
        width: 96,
        height: 48
      })

      const subscription = bridge.query(TestSpatialCardSchema, {
        spatial: {
          kind: 'window',
          rect: { x: 0, y: 0, width: 240, height: 220 },
          fields: { x: 'x', y: 'y', width: 'width', height: 'height' }
        },
        orderBy: { title: 'asc' }
      })
      const callback = vi.fn()

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Visible'
        ])
      })

      const unsubscribe = subscription.subscribe(callback)

      await bridge.update(offscreen.id, { x: 72, y: 84 })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Offscreen',
          'Visible'
        ])
      })

      expect(callback).toHaveBeenCalled()

      await bridge.update(visible.id, { x: 520, y: 540 })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Offscreen'
        ])
      })

      unsubscribe()
    })

    it('should reload bounded query windows when ordering changes membership', async () => {
      const first = await bridge.create(TestTaskSchema, { title: 'A Task' })
      await bridge.create(TestTaskSchema, { title: 'B Task' })

      const subscription = bridge.query(TestTaskSchema, {
        orderBy: { title: 'asc' },
        limit: 1
      })
      const callback = vi.fn()

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.[0]?.properties.title).toBe('A Task')
      })

      const unsubscribe = subscription.subscribe(callback)

      await bridge.update(first.id, { title: 'Z Task' })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.[0]?.properties.title).toBe('B Task')
      })

      expect(callback).toHaveBeenCalled()

      unsubscribe()
    })

    it('should unsubscribe correctly', async () => {
      const subscription = bridge.query(TestTaskSchema)
      const callback = vi.fn()

      // Wait for initial load
      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).not.toBeNull()
      })

      // Subscribe and immediately unsubscribe
      const unsubscribe = subscription.subscribe(callback)
      unsubscribe()

      // Create a node
      await bridge.create(TestTaskSchema, { title: 'After Unsubscribe' })

      // Wait a bit to ensure callback wasn't called
      await new Promise((r) => setTimeout(r, 50))

      // Callback should not have been called after unsubscribe
      // (it may have been called once during subscription setup)
      const callCountAfterUnsubscribe = callback.mock.calls.length
      await bridge.create(TestTaskSchema, { title: 'Another Task' })
      await new Promise((r) => setTimeout(r, 50))

      expect(callback.mock.calls.length).toBe(callCountAfterUnsubscribe)
    })
  })

  describe('create', () => {
    it('should create a node', async () => {
      const node = await bridge.create(TestTaskSchema, { title: 'New Task' })

      expect(node.id).toBeDefined()
      expect(node.schemaId).toBe(TestTaskSchema._schemaId)
      expect(node.properties.title).toBe('New Task')
    })

    it('should create a node with custom ID', async () => {
      const node = await bridge.create(TestTaskSchema, { title: 'Custom ID' }, 'my-custom-id')

      expect(node.id).toBe('my-custom-id')
    })
  })

  describe('update', () => {
    it('should update a node', async () => {
      const created = await bridge.create(TestTaskSchema, { title: 'Original' })
      const updated = await bridge.update(created.id, { title: 'Updated' })

      expect(updated.properties.title).toBe('Updated')
    })
  })

  describe('delete', () => {
    it('should soft-delete a node', async () => {
      const created = await bridge.create(TestTaskSchema, { title: 'To Delete' })
      await bridge.delete(created.id)

      const fetched = await bridge.get!(created.id)
      expect(fetched?.deleted).toBe(true)
    })
  })

  describe('restore', () => {
    it('should restore a deleted node', async () => {
      const created = await bridge.create(TestTaskSchema, { title: 'To Restore' })
      await bridge.delete(created.id)

      const restored = await bridge.restore(created.id)
      expect(restored.deleted).toBe(false)
    })
  })

  describe('status', () => {
    it('should always return connected for MainThreadBridge', () => {
      expect(bridge.status).toBe('connected')
    })

    it('should allow subscribing to status events', () => {
      const callback = vi.fn()
      const unsubscribe = bridge.on('status', callback)

      // MainThreadBridge doesn't emit status changes, but subscription should work
      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })
  })

  describe('direct store access', () => {
    it('should expose nodeStore', () => {
      expect(bridge.nodeStore).toBe(store)
    })

    it('should allow direct get', async () => {
      const created = await bridge.create(TestTaskSchema, { title: 'Direct Get' })
      const fetched = await bridge.get!(created.id)

      expect(fetched?.properties.title).toBe('Direct Get')
    })

    it('should allow direct list', async () => {
      await bridge.create(TestTaskSchema, { title: 'Task 1' })
      await bridge.create(TestTaskSchema, { title: 'Task 2' })

      const list = await bridge.list!({ schemaId: TestTaskSchema._schemaId })
      expect(list).toHaveLength(2)
    })

    it('should allow subscribing to changes', async () => {
      const callback = vi.fn()
      const unsubscribe = bridge.subscribeToChanges!(callback)

      await bridge.create(TestTaskSchema, { title: 'Change Event' })

      expect(callback).toHaveBeenCalled()
      unsubscribe()
    })
  })

  describe('destroy', () => {
    it('should clean up resources', () => {
      bridge.destroy()

      // After destroy, queries should still work but cache is cleared
      const subscription = bridge.query(TestTaskSchema)
      expect(subscription.getSnapshot()).toBeNull()
    })
  })
})
