/**
 * Tests for MainThreadBridge
 */

import type {
  RemoteNodeQueryClient,
  RemoteNodeQueryInvalidationObserver,
  RemoteNodeQuerySource,
  RemoteNodeQueryStreamObserver,
  RemoteNodeQuerySuccessResponse,
  RemoteQueryCompleteness,
  RemoteQueryStaleness,
  RemoteQueryVerification
} from '../remote-query-protocol'
import type { DID } from '@xnetjs/core'
import type { NodeState } from '@xnetjs/data'
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

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
} {
  let resolve: (value: T) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function createRemoteNode(id: string, title: string, updatedAt = Date.now()): NodeState {
  return {
    id,
    schemaId: TestTaskSchema._schemaId,
    properties: { title, done: false },
    timestamps: {
      title: { lamport: { time: 1, author: 'did:key:remote' }, wallTime: updatedAt }
    },
    createdAt: updatedAt,
    createdBy: 'did:key:remote',
    updatedAt,
    updatedBy: 'did:key:remote',
    deleted: false
  }
}

function createRemoteSuccess(input: {
  nodes: NodeState[]
  source?: RemoteNodeQuerySource
  completeness?: RemoteQueryCompleteness
  staleness?: RemoteQueryStaleness
  verification?: RemoteQueryVerification
}): RemoteNodeQuerySuccessResponse {
  const now = Date.now()
  const source = input.source ?? 'hub'
  const pageInfo = {
    totalCount: input.nodes.length,
    countMode: 'exact' as const,
    hasMore: false,
    hasNextPage: false,
    hasPreviousPage: false,
    loadedCount: input.nodes.length
  }

  return {
    type: 'node-query/result',
    requestId: 'query-1',
    source,
    nodes: input.nodes,
    pageInfo,
    metadata: {
      source,
      updatedAt: now,
      pageInfo
    },
    completeness: input.completeness ?? { level: 'complete' },
    staleness: input.staleness ?? { level: 'fresh', asOf: now },
    verification: input.verification ?? { status: 'verified' }
  }
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

    it('should expose storage-owned deterministic bulk writes', async () => {
      const result = await bridge.bulkWrite({
        kind: 'deterministic-import',
        drafts: [
          {
            id: 'bridge-bulk-node-1',
            schemaId: TestTaskSchema._schemaId,
            properties: { title: 'Bridge Bulk 1', done: false }
          },
          {
            id: 'bridge-bulk-node-2',
            schemaId: TestTaskSchema._schemaId,
            properties: { title: 'Bridge Bulk 2', done: true }
          }
        ]
      })

      expect(result).toMatchObject({
        created: 2,
        updated: 0,
        nodeIds: ['bridge-bulk-node-1', 'bridge-bulk-node-2'],
        schemaIds: [TestTaskSchema._schemaId],
        changeCount: 2
      })
      await expect(store.get('bridge-bulk-node-1')).resolves.toMatchObject({
        properties: { title: 'Bridge Bulk 1', done: false }
      })
    })

    it('should coalesce deterministic import batch notifications into one query refresh', async () => {
      const subscription = bridge.query(TestTaskSchema)
      const callback = vi.fn()

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).toEqual([])
      })

      const unsubscribe = subscription.subscribe(callback)

      await store.importDeterministicNodes(
        Array.from({ length: 30 }, (_, index) => ({
          id: `bulk-query-node-${index}`,
          schemaId: TestTaskSchema._schemaId,
          properties: {
            title: `Bulk Query Node ${index}`,
            done: false
          }
        }))
      )

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).toHaveLength(30)
      })

      expect(callback).toHaveBeenCalledTimes(1)
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

    it('should expose exact totalCount metadata for bounded queries', async () => {
      await bridge.create(TestTaskSchema, { title: 'Task 1', done: false })
      await bridge.create(TestTaskSchema, { title: 'Task 2', done: false })
      await bridge.create(TestTaskSchema, { title: 'Task 3', done: true })

      const subscription = bridge.query(TestTaskSchema, {
        where: { done: false },
        limit: 1
      })

      await vi.waitFor(() => {
        const snapshot = subscription.getSnapshot()
        if (snapshot === null || snapshot.length !== 1) {
          throw new Error('Waiting for bounded snapshot')
        }
      })

      expect(subscription.getMetadata()?.pageInfo).toMatchObject({
        totalCount: 2,
        hasMore: true,
        hasNextPage: true,
        hasPreviousPage: false,
        loadedCount: 1
      })
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

    it('should render local data before merging local-then-remote results', async () => {
      bridge.destroy()

      const local = await store.create({
        schemaId: TestTaskSchema._schemaId,
        properties: { title: 'Local Task', done: false }
      })
      const remote = createRemoteNode('remote-task', 'Remote Task', local.updatedAt + 1)
      const remoteResponse = createDeferred<RemoteNodeQuerySuccessResponse>()
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async (request) => {
          expect(request.mode).toBe('local-then-remote')
          expect(request.source).toBe('hub')
          expect(request.client?.knownNodeIds).toContain(local.id)
          return remoteResponse.promise
        })
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'local-then-remote',
        source: 'hub'
      })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Local Task'
        ])
      })

      remoteResponse.resolve(createRemoteSuccess({ nodes: [remote] }))

      await vi.waitFor(() => {
        expect(new Set(subscription.getSnapshot()?.map((node) => node.properties.title))).toEqual(
          new Set(['Local Task', 'Remote Task'])
        )
      })

      expect(subscription.getMetadata()).toMatchObject({
        source: 'hybrid',
        completeness: { level: 'complete' },
        staleness: { level: 'fresh' },
        verification: { status: 'verified' }
      })
    })

    it('should preserve local snapshots when local-then-remote reads fail', async () => {
      bridge.destroy()

      await store.create({
        schemaId: TestTaskSchema._schemaId,
        properties: { title: 'Local Task', done: false }
      })
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async () => {
          throw new Error('Hub offline')
        })
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'local-then-remote',
        source: 'hub'
      })

      await vi.waitFor(() => {
        expect(subscription.getMetadata()?.error).toBe('Hub offline')
      })

      expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
        'Local Task'
      ])
      expect(subscription.getMetadata()).toMatchObject({
        source: 'hybrid',
        completeness: { level: 'partial', reason: 'remote-unavailable' },
        staleness: { level: 'stale' },
        verification: { status: 'unverified' }
      })
    })

    it('should use remote results for remote-only reads', async () => {
      bridge.destroy()

      await store.create({
        schemaId: TestTaskSchema._schemaId,
        properties: { title: 'Hidden Local Task', done: false }
      })
      const remote = createRemoteNode('remote-task', 'Remote Task')
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async (request) => {
          expect(request.mode).toBe('remote')
          expect(request.client?.knownNodeIds).toEqual([])
          return createRemoteSuccess({
            nodes: [remote],
            completeness: { level: 'partial', reason: 'auth-filtered' },
            staleness: { level: 'stale', asOf: 123, maxAgeMs: 1000 },
            verification: { status: 'mixed', verifiedNodeIds: ['remote-task'] }
          })
        })
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'remote',
        source: 'hub'
      })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Remote Task'
        ])
      })

      expect(subscription.getMetadata()).toMatchObject({
        source: 'hub',
        completeness: { level: 'partial', reason: 'auth-filtered' },
        staleness: { level: 'stale', asOf: 123, maxAgeMs: 1000 },
        verification: { status: 'mixed', verifiedNodeIds: ['remote-task'] }
      })
    })

    it('should reject remote-only reads when remote verification fails', async () => {
      bridge.destroy()

      const forbidden = createRemoteNode('forbidden-task', 'Forbidden Task')
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async () =>
          createRemoteSuccess({
            nodes: [forbidden],
            verification: {
              status: 'failed',
              failedNodeIds: ['forbidden-task']
            }
          })
        )
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'remote',
        source: 'hub'
      })

      await vi.waitFor(() => {
        expect(subscription.getMetadata()?.error).toBe('Remote query result verification failed')
      })

      expect(subscription.getSnapshot()).toEqual([])
      expect(subscription.getMetadata()).toMatchObject({
        source: 'hub',
        verification: { status: 'failed' },
        error: 'Remote query result verification failed'
      })
    })

    it('should filter mixed remote verification before caching snapshots', async () => {
      bridge.destroy()

      const verified = createRemoteNode('verified-task', 'Verified Task')
      const failed = createRemoteNode('failed-task', 'Failed Task')
      const unlisted = createRemoteNode('unlisted-task', 'Unlisted Task')
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async () =>
          createRemoteSuccess({
            nodes: [verified, failed, unlisted],
            verification: {
              status: 'mixed',
              verifiedNodeIds: ['verified-task'],
              failedNodeIds: ['failed-task']
            }
          })
        )
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'remote',
        source: 'hub'
      })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Verified Task'
        ])
      })

      expect(subscription.getMetadata()).toMatchObject({
        source: 'hub',
        pageInfo: {
          loadedCount: 1
        },
        verification: {
          status: 'mixed',
          verifiedNodeIds: ['verified-task'],
          failedNodeIds: ['failed-task']
        }
      })
    })

    it('should keep source auto queries local below the routing threshold', async () => {
      bridge.destroy()

      await store.create({
        schemaId: TestTaskSchema._schemaId,
        properties: { title: 'Small Local Task', done: false }
      })
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async () => createRemoteSuccess({ nodes: [] }))
      }

      bridge = new MainThreadBridge(store, {
        remoteNodeQueryClient: remoteClient,
        remoteNodeQueryRouting: {
          localRowThreshold: 10,
          hybridRowThreshold: 100
        }
      })
      const subscription = bridge.query(TestTaskSchema, {
        source: 'auto'
      })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Small Local Task'
        ])
      })
      await new Promise((resolve) => setTimeout(resolve, 25))

      expect(remoteClient.query).not.toHaveBeenCalled()
    })

    it('should route source auto queries over threshold through remote refresh', async () => {
      bridge.destroy()

      const local = await store.create({
        schemaId: TestTaskSchema._schemaId,
        properties: { title: 'Auto Local Task', done: false }
      })
      const remote = createRemoteNode('auto-remote-task', 'Auto Remote Task', local.updatedAt + 1)
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async (request) => {
          expect(request.mode).toBe('local-then-remote')
          expect(request.source).toBe('hub')
          expect(request.descriptor.mode).toBe('local-then-remote')
          expect(request.descriptor.source).toBe('hub')
          expect(request.client?.knownNodeIds).toContain(local.id)
          return createRemoteSuccess({ nodes: [remote] })
        })
      }

      bridge = new MainThreadBridge(store, {
        remoteNodeQueryClient: remoteClient,
        remoteNodeQueryRouting: {
          localRowThreshold: 1,
          hybridRowThreshold: 100
        }
      })
      const subscription = bridge.query(TestTaskSchema, {
        source: 'auto'
      })

      await vi.waitFor(() => {
        expect(new Set(subscription.getSnapshot()?.map((node) => node.properties.title))).toEqual(
          new Set(['Auto Local Task', 'Auto Remote Task'])
        )
      })

      expect(subscription.getMetadata()).toMatchObject({
        source: 'hybrid',
        routing: {
          source: 'hub',
          reason: 'auto-medium-result',
          localRowCount: 1,
          thresholds: {
            localRowThreshold: 1,
            hybridRowThreshold: 100
          }
        }
      })
    })

    it('should dedupe federated local and remote results by newest update time', async () => {
      bridge.destroy()

      const local = await store.create({
        id: 'shared-task',
        schemaId: TestTaskSchema._schemaId,
        properties: { title: 'Local Newer Task', done: false }
      })
      const olderRemote = createRemoteNode('shared-task', 'Remote Older Task', local.updatedAt - 1)
      const federatedRemote = createRemoteNode('federated-task', 'Federated Task')
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async () =>
          createRemoteSuccess({
            nodes: [olderRemote, federatedRemote],
            source: 'federated',
            completeness: { level: 'partial', reason: 'federation-partial', sourceCount: 2 }
          })
        )
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'local-then-remote',
        source: 'federated'
      })

      await vi.waitFor(() => {
        expect(new Set(subscription.getSnapshot()?.map((node) => node.properties.title))).toEqual(
          new Set(['Local Newer Task', 'Federated Task'])
        )
      })

      expect(subscription.getMetadata()).toMatchObject({
        source: 'hybrid',
        completeness: { level: 'partial', reason: 'federation-partial', sourceCount: 2 }
      })
    })

    it('should refresh remote invalidations without dropping local snapshots', async () => {
      bridge.destroy()

      const local = await store.create({
        schemaId: TestTaskSchema._schemaId,
        properties: { title: 'Local Task', done: false }
      })
      const initialRemote = createRemoteNode(
        'remote-task',
        'Initial Remote Task',
        local.updatedAt + 1
      )
      const updatedRemote = createRemoteNode(
        'remote-task',
        'Updated Remote Task',
        local.updatedAt + 2
      )
      const firstRemoteResponse = createDeferred<RemoteNodeQuerySuccessResponse>()
      const secondRemoteResponse = createDeferred<RemoteNodeQuerySuccessResponse>()
      let invalidationObserver: RemoteNodeQueryInvalidationObserver | null = null
      const unsubscribeInvalidations = vi.fn()
      const remoteClient: RemoteNodeQueryClient = {
        query: vi
          .fn()
          .mockImplementationOnce(async () => firstRemoteResponse.promise)
          .mockImplementationOnce(async () => secondRemoteResponse.promise),
        subscribeInvalidations: vi.fn((observer) => {
          invalidationObserver = observer
          return unsubscribeInvalidations
        })
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'local-then-remote',
        source: 'hub'
      })
      const callback = vi.fn()
      const unsubscribe = subscription.subscribe(callback)

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Local Task'
        ])
      })

      firstRemoteResponse.resolve(createRemoteSuccess({ nodes: [initialRemote] }))

      await vi.waitFor(() => {
        expect(new Set(subscription.getSnapshot()?.map((node) => node.properties.title))).toEqual(
          new Set(['Local Task', 'Initial Remote Task'])
        )
      })

      invalidationObserver!.next({
        type: 'node-query/invalidate',
        schemaId: TestTaskSchema._schemaId,
        reason: 'poke'
      })

      await vi.waitFor(() => {
        expect(remoteClient.query).toHaveBeenCalledTimes(2)
      })
      expect(new Set(subscription.getSnapshot()?.map((node) => node.properties.title))).toEqual(
        new Set(['Local Task', 'Initial Remote Task'])
      )

      secondRemoteResponse.resolve(createRemoteSuccess({ nodes: [updatedRemote] }))

      await vi.waitFor(() => {
        expect(new Set(subscription.getSnapshot()?.map((node) => node.properties.title))).toEqual(
          new Set(['Local Task', 'Updated Remote Task'])
        )
      })

      expect(callback).toHaveBeenCalled()
      unsubscribe()
      bridge.destroy()
      expect(unsubscribeInvalidations).toHaveBeenCalledTimes(1)
    })

    it('should reduce remote stream events into active stream queries', async () => {
      bridge.destroy()

      let observer: RemoteNodeQueryStreamObserver | null = null
      const cleanup = vi.fn()
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async () => createRemoteSuccess({ nodes: [] })),
        stream: vi.fn((request, nextObserver) => {
          expect(request.mode).toBe('stream')
          expect(request.source).toBe('hub')
          observer = nextObserver
          return cleanup
        })
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'stream',
        source: 'hub'
      })
      const callback = vi.fn()

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).toEqual([])
      })

      const unsubscribe = subscription.subscribe(callback)

      await vi.waitFor(() => {
        expect(remoteClient.stream).toHaveBeenCalledTimes(1)
      })

      const first = createRemoteNode('stream-task-1', 'Stream Task 1')
      const second = createRemoteNode('stream-task-2', 'Stream Task 2')
      observer!.next({
        type: 'snapshot',
        nodes: [first],
        metadata: createRemoteSuccess({ nodes: [first] }).metadata
      })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Stream Task 1'
        ])
      })

      observer!.next({ type: 'insert', node: second, index: 0 })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Stream Task 2',
          'Stream Task 1'
        ])
      })

      expect(callback).toHaveBeenCalled()
      expect(subscription.getMetadata()).toMatchObject({
        source: 'hub',
        stream: {
          status: 'ready',
          lastEvent: 'insert'
        }
      })

      unsubscribe()
      expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it('should reset stream queries to loading on reconnect resets', async () => {
      bridge.destroy()

      let observer: RemoteNodeQueryStreamObserver | null = null
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async () => createRemoteSuccess({ nodes: [] })),
        stream: vi.fn((_request, nextObserver) => {
          observer = nextObserver
          return vi.fn()
        })
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'stream',
        source: 'hub'
      })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).toEqual([])
      })

      const unsubscribe = subscription.subscribe(vi.fn())

      await vi.waitFor(() => {
        expect(remoteClient.stream).toHaveBeenCalledTimes(1)
      })

      const first = createRemoteNode('stream-task-1', 'Stream Task 1')
      observer!.next({ type: 'snapshot', nodes: [first] })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).toHaveLength(1)
      })

      observer!.next({ type: 'reset', reason: 'reconnect' })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).toBeNull()
      })
      expect(subscription.getMetadata()?.stream).toMatchObject({
        status: 'loading',
        lastEvent: 'reset',
        resetReason: 'reconnect'
      })

      unsubscribe()
    })

    it('should keep remote streams alive until the last subscriber unsubscribes', async () => {
      bridge.destroy()

      let observer: RemoteNodeQueryStreamObserver | null = null
      const cleanup = vi.fn()
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async () => createRemoteSuccess({ nodes: [] })),
        stream: vi.fn((_request, nextObserver) => {
          observer = nextObserver
          return { unsubscribe: cleanup }
        })
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'stream',
        source: 'hub'
      })
      const firstCallback = vi.fn()
      const secondCallback = vi.fn()

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).toEqual([])
      })

      const unsubscribeFirst = subscription.subscribe(firstCallback)
      const unsubscribeSecond = subscription.subscribe(secondCallback)

      await vi.waitFor(() => {
        expect(remoteClient.stream).toHaveBeenCalledTimes(1)
      })

      unsubscribeFirst()
      expect(cleanup).not.toHaveBeenCalled()

      const streamed = createRemoteNode('stream-task', 'Still Streaming')
      observer!.next({ type: 'snapshot', nodes: [streamed] })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Still Streaming'
        ])
      })
      expect(secondCallback).toHaveBeenCalled()

      unsubscribeSecond()
      expect(cleanup).toHaveBeenCalledTimes(1)

      observer!.next({
        type: 'insert',
        node: createRemoteNode('late-task', 'Ignored After Unsubscribe')
      })

      expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
        'Still Streaming'
      ])
    })

    it('should filter mixed verification stream snapshots before reducing them', async () => {
      bridge.destroy()

      let observer: RemoteNodeQueryStreamObserver | null = null
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async () => createRemoteSuccess({ nodes: [] })),
        stream: vi.fn((_request, nextObserver) => {
          observer = nextObserver
          return vi.fn()
        })
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'stream',
        source: 'hub'
      })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).toEqual([])
      })

      const unsubscribe = subscription.subscribe(vi.fn())

      await vi.waitFor(() => {
        expect(remoteClient.stream).toHaveBeenCalledTimes(1)
      })

      const verified = createRemoteNode('verified-stream-task', 'Verified Stream Task')
      const failed = createRemoteNode('failed-stream-task', 'Failed Stream Task')
      const metadata = {
        ...createRemoteSuccess({ nodes: [verified, failed] }).metadata,
        verification: {
          status: 'mixed' as const,
          verifiedNodeIds: ['verified-stream-task'],
          failedNodeIds: ['failed-stream-task']
        }
      }

      observer!.next({
        type: 'snapshot',
        nodes: [verified, failed],
        metadata
      })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Verified Stream Task'
        ])
      })

      observer!.next({
        type: 'insert',
        node: failed,
        metadata
      })

      await new Promise((resolve) => setTimeout(resolve, 25))

      expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
        'Verified Stream Task'
      ])
      expect(subscription.getMetadata()).toMatchObject({
        verification: {
          status: 'mixed',
          verifiedNodeIds: ['verified-stream-task'],
          failedNodeIds: ['failed-stream-task']
        },
        stream: {
          status: 'ready'
        }
      })

      unsubscribe()
    })

    it('should turn failed verification stream events into terminal stream errors', async () => {
      bridge.destroy()

      let observer: RemoteNodeQueryStreamObserver | null = null
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async () => createRemoteSuccess({ nodes: [] })),
        stream: vi.fn((_request, nextObserver) => {
          observer = nextObserver
          return vi.fn()
        })
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'stream',
        source: 'hub'
      })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).toEqual([])
      })

      const unsubscribe = subscription.subscribe(vi.fn())

      await vi.waitFor(() => {
        expect(remoteClient.stream).toHaveBeenCalledTimes(1)
      })

      const forbidden = createRemoteNode('forbidden-stream-task', 'Forbidden Stream Task')
      observer!.next({
        type: 'snapshot',
        nodes: [forbidden],
        metadata: {
          ...createRemoteSuccess({ nodes: [forbidden] }).metadata,
          verification: {
            status: 'failed',
            failedNodeIds: ['forbidden-stream-task']
          }
        }
      })

      await vi.waitFor(() => {
        expect(subscription.getMetadata()?.error).toBe('Remote stream event verification failed')
      })

      expect(subscription.getSnapshot()).toEqual([])
      expect(subscription.getMetadata()).toMatchObject({
        verification: { status: 'failed' },
        stream: {
          status: 'error',
          lastEvent: 'error',
          error: 'Remote stream event verification failed'
        }
      })

      unsubscribe()
    })

    it('should fall back to one-shot remote reads when stream transport is unavailable', async () => {
      bridge.destroy()

      const remote = createRemoteNode('remote-stream-fallback', 'Remote Snapshot Fallback')
      const remoteClient: RemoteNodeQueryClient = {
        query: vi.fn(async (request) => {
          expect(request.mode).toBe('stream')
          return createRemoteSuccess({ nodes: [remote] })
        })
      }

      bridge = new MainThreadBridge(store, { remoteNodeQueryClient: remoteClient })
      const subscription = bridge.query(TestTaskSchema, {
        mode: 'stream',
        source: 'hub'
      })

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()).toEqual([])
      })

      const unsubscribe = subscription.subscribe(vi.fn())

      await vi.waitFor(() => {
        expect(subscription.getSnapshot()?.map((node) => node.properties.title)).toEqual([
          'Remote Snapshot Fallback'
        ])
      })

      expect(remoteClient.query).toHaveBeenCalledTimes(1)

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
