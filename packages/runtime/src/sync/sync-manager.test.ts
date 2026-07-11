import type { NodeStore, NodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { signYjsUpdate } from '@xnetjs/sync'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

type MockQueueEntry = {
  nodeId: string
  update: string
  clientId?: number
  queuedAt: number
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const connectionStatusListeners = new Set<(status: ConnectionStatus) => void>()
let currentStatus: ConnectionStatus = 'disconnected'
let roomReadyPromise: Promise<void> = Promise.resolve()
let mockOfflineQueueSize = 0
let drainDeferred: Deferred<number> | null = null
let sharedDoc = new Y.Doc()
const roomHandlers = new Map<string, (data: Record<string, unknown>) => void>()

const mockConnection = {
  connect: vi.fn(() => {
    emitConnectionStatus('connecting')
  }),
  disconnect: vi.fn(() => {
    emitConnectionStatus('disconnected')
  }),
  joinRoom: vi.fn(() => () => {}),
  joinRoomAsync: vi.fn((room: string, handler: (data: Record<string, unknown>) => void) => {
    roomHandlers.set(room, handler)
    return {
      unsubscribe: vi.fn(() => {
        roomHandlers.delete(room)
      }),
      ready: roomReadyPromise
    }
  }),
  leaveRoom: vi.fn(),
  publish: vi.fn(),
  sendRaw: vi.fn(),
  onMessage: vi.fn(() => () => {}),
  onStatus: vi.fn((handler: (status: ConnectionStatus) => void) => {
    connectionStatusListeners.add(handler)
    return () => connectionStatusListeners.delete(handler)
  }),
  get status() {
    return currentStatus
  },
  get roomCount() {
    return 0
  }
}

const mockOfflineQueue = {
  enqueue: vi.fn(async () => undefined),
  drain: vi.fn(async (_handler: (entry: MockQueueEntry) => Promise<void>) => {
    if (!drainDeferred) {
      return 0
    }
    return drainDeferred.promise
  }),
  get size() {
    return mockOfflineQueueSize
  },
  load: vi.fn(async () => undefined),
  save: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined)
}

const mockRegistry = {
  load: vi.fn(async () => undefined),
  save: vi.fn(async () => undefined),
  prune: vi.fn(),
  getTracked: vi.fn(() => []),
  track: vi.fn(),
  untrack: vi.fn(),
  touch: vi.fn(),
  markSynced: vi.fn()
}

const mockPool = {
  acquire: vi.fn(async () => sharedDoc),
  release: vi.fn(),
  has: vi.fn(() => false),
  flushAll: vi.fn(async () => undefined),
  destroy: vi.fn(async () => undefined),
  get size() {
    return 0
  }
}

function emitConnectionStatus(status: ConnectionStatus): void {
  currentStatus = status
  for (const listener of connectionStatusListeners) {
    listener(status)
  }
}

vi.mock('./blob-sync', () => ({
  createBlobSyncProvider: vi.fn(() => null)
}))

vi.mock('./connection-manager', () => ({
  createConnectionManager: vi.fn(() => mockConnection),
  createMultiHubConnectionManager: vi.fn(() => mockConnection)
}))

vi.mock('./meta-bridge', () => ({
  createMetaBridge: vi.fn(() => ({}))
}))

vi.mock('./node-pool', () => ({
  createNodePool: vi.fn(() => mockPool)
}))

vi.mock('./offline-queue', () => ({
  createOfflineQueue: vi.fn(() => mockOfflineQueue)
}))

vi.mock('./registry', () => ({
  createRegistry: vi.fn(() => mockRegistry)
}))

vi.mock('./node-store-sync-provider', () => ({
  // A regular function (not an arrow) so `new NodeStoreSyncProvider()` works —
  // the share-room path (0298) constructs it, unlike the author-room provider.
  NodeStoreSyncProvider: vi.fn().mockImplementation(function () {
    return { attach: vi.fn(), detach: vi.fn() }
  })
}))

import { createConnectionManager, createMultiHubConnectionManager } from './connection-manager'
import { NodeStoreSyncProvider } from './node-store-sync-provider'
import { createSyncManager } from './sync-manager'

describe('createSyncManager', () => {
  beforeEach(() => {
    currentStatus = 'disconnected'
    roomReadyPromise = Promise.resolve()
    mockOfflineQueueSize = 0
    drainDeferred = null
    connectionStatusListeners.clear()
    roomHandlers.clear()
    sharedDoc = new Y.Doc()

    mockConnection.connect.mockClear()
    mockConnection.disconnect.mockClear()
    mockConnection.joinRoom.mockClear()
    mockConnection.joinRoomAsync.mockClear()
    mockConnection.publish.mockClear()
    mockConnection.onStatus.mockClear()
    vi.mocked(createConnectionManager).mockClear()
    vi.mocked(createMultiHubConnectionManager).mockClear()
    mockOfflineQueue.enqueue.mockClear()
    mockOfflineQueue.drain.mockClear()
    mockOfflineQueue.load.mockClear()
    mockOfflineQueue.save.mockClear()
    mockRegistry.load.mockClear()
    mockRegistry.save.mockClear()
    mockRegistry.prune.mockClear()
    mockRegistry.getTracked.mockReturnValue([])
    mockPool.acquire.mockClear()
    mockPool.release.mockClear()
    mockPool.has.mockReturnValue(false)
    mockPool.flushAll.mockClear()
    mockPool.destroy.mockClear()
  })

  it('moves through connecting, replaying, healthy, degraded, and stopped phases', async () => {
    drainDeferred = createDeferred<number>()
    mockOfflineQueueSize = 2

    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444'
    })

    expect(manager.lifecycle.phase).toBe('idle')

    await manager.start()
    expect(manager.lifecycle.phase).toBe('connecting')

    emitConnectionStatus('connected')
    expect(manager.lifecycle.phase).toBe('replaying')

    mockOfflineQueueSize = 0
    drainDeferred.resolve(2)
    await drainDeferred.promise
    await Promise.resolve()
    await Promise.resolve()

    expect(manager.lifecycle.phase).toBe('healthy')

    emitConnectionStatus('error')
    expect(manager.lifecycle.phase).toBe('degraded')

    await manager.stop()
    expect(manager.lifecycle.phase).toBe('stopped')
  })

  it('refcounts share-room subscriptions so one unsubscribe does not kill another (0298)', async () => {
    const ProviderMock = vi.mocked(NodeStoreSyncProvider)
    ProviderMock.mockClear()
    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444'
    })

    // Two callers subscribe to the same room → exactly one provider is built.
    manager.subscribeShareRoom('xnet-channel-x')
    manager.subscribeShareRoom('xnet-channel-x')
    expect(ProviderMock).toHaveBeenCalledTimes(1)
    const provider = ProviderMock.mock.results[0].value as { detach: ReturnType<typeof vi.fn> }
    expect(provider.detach).not.toHaveBeenCalled()

    // First unsubscribe: one ref remains, provider stays attached.
    manager.unsubscribeShareRoom('xnet-channel-x')
    expect(provider.detach).not.toHaveBeenCalled()

    // Last unsubscribe: provider detaches.
    manager.unsubscribeShareRoom('xnet-channel-x')
    expect(provider.detach).toHaveBeenCalledTimes(1)
  })

  it('drains the offline queue when the background load finishes after connect (0229)', async () => {
    // The hub is now dialed before the offline-queue load completes. If the
    // load is still in flight when the connection comes up (the SQLite worker
    // was stalled), the connect-time drain sees an empty queue — so the load
    // must re-drain once entries are available.
    const loadDeferred = createDeferred<void>()
    mockOfflineQueue.load.mockReturnValueOnce(loadDeferred.promise)
    mockOfflineQueueSize = 1
    drainDeferred = createDeferred<number>()

    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444'
    })
    await manager.start()
    expect(mockConnection.connect).toHaveBeenCalled() // dialed without awaiting load

    emitConnectionStatus('connected')
    mockOfflineQueue.drain.mockClear()

    // The (stalled) load now resolves with entries present.
    loadDeferred.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(mockOfflineQueue.drain).toHaveBeenCalled()

    drainDeferred.resolve(1)
    await manager.stop()
  })

  it('persists the registry on a debounce after track, not only on stop (0212)', async () => {
    vi.useFakeTimers()
    try {
      const manager = createSyncManager({
        nodeStore: {} as NodeStore,
        storage: {} as NodeStorageAdapter,
        signalingUrl: 'ws://localhost:4444'
      })
      await manager.start()
      mockRegistry.save.mockClear()

      manager.track('node-1', 'xnet://xnet.fyi/Page@1.0.0')
      expect(mockRegistry.track).toHaveBeenCalledWith('node-1', 'xnet://xnet.fyi/Page@1.0.0')
      // The save is debounced — not synchronous with track().
      expect(mockRegistry.save).not.toHaveBeenCalled()

      vi.advanceTimersByTime(2000)
      expect(mockRegistry.save).toHaveBeenCalledTimes(1)

      // A burst of tracks within the window coalesces into a single save.
      mockRegistry.save.mockClear()
      manager.track('node-2', 'xnet://xnet.fyi/Page@1.0.0')
      manager.track('node-3', 'xnet://xnet.fyi/Page@1.0.0')
      vi.advanceTimersByTime(2000)
      expect(mockRegistry.save).toHaveBeenCalledTimes(1)

      await manager.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not attach (leak) lifecycle listeners if stop() interleaves during start() (0212)', async () => {
    const addSpy = vi.spyOn(globalThis, 'addEventListener')
    // Hold registry.load() open so we can stop() while start() is suspended on it.
    const loadGate = createDeferred<void>()
    mockRegistry.load.mockImplementationOnce(() => loadGate.promise)
    try {
      const manager = createSyncManager({
        nodeStore: {} as NodeStore,
        storage: {} as NodeStorageAdapter,
        signalingUrl: 'ws://localhost:4444'
      })

      const startPromise = manager.start() // suspends on registry.load()
      await manager.stop() // interleaves: sets stopped=true; detach is a no-op (nothing attached yet)
      loadGate.resolve() // start() resumes past the await…
      await startPromise // …and must bail before attaching listeners

      const attachedVisibility = addSpy.mock.calls.some(([type]) => type === 'visibilitychange')
      expect(attachedVisibility).toBe(false)
    } finally {
      addSpy.mockRestore()
    }
  })

  it('uses multi-hub orchestration when multiple signaling URLs are configured', () => {
    createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://hub-a.example.net',
      signalingUrls: ['ws://hub-a.example.net', 'ws://hub-b.example.net']
    })

    expect(createConnectionManager).not.toHaveBeenCalled()
    expect(createMultiHubConnectionManager).toHaveBeenCalledWith({
      hubs: [
        { url: 'ws://hub-a.example.net', ucanToken: undefined, getUCANToken: undefined },
        { url: 'ws://hub-b.example.net', ucanToken: undefined, getUCANToken: undefined }
      ]
    })
  })

  it('reports reconciliation after replaying offline updates and repairing rooms', async () => {
    mockPool.has.mockReturnValue(true)
    mockOfflineQueueSize = 1
    mockOfflineQueue.drain.mockImplementationOnce(async (handler) => {
      await handler({
        nodeId: 'node-1',
        update: btoa(String.fromCharCode(1, 2, 3)),
        clientId: 7,
        queuedAt: Date.now()
      })
      mockOfflineQueueSize = 0
      return 1
    })
    const reports: unknown[] = []
    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444',
      replication: {
        compatibility: {
          allowUnsignedReplication: true
        }
      }
    })

    await manager.start()
    await manager.acquire('node-1')
    manager.on('reconciliation', (report) => {
      reports.push(report)
    })

    const report = await manager.reconcile({
      nodeIds: ['node-1'],
      reason: 'partition-repair'
    })

    expect(report).toMatchObject({
      reason: 'partition-repair',
      replayedOfflineChanges: 1,
      repairedNodeIds: ['node-1'],
      skippedNodeIds: []
    })
    expect(manager.lastReconciliationReport).toBe(report)
    expect(reports).toEqual([report])
    expect(mockConnection.publish).toHaveBeenCalledWith('xnet-doc-node-1', {
      type: 'sync-update',
      from: expect.any(String),
      update: btoa(String.fromCharCode(1, 2, 3))
    })
    expect(mockConnection.publish).toHaveBeenCalledWith('xnet-doc-node-1', {
      type: 'sync-step1',
      from: expect.any(String),
      sv: expect.any(String)
    })
  })

  it('repairs tracked rooms when a partition heals', async () => {
    mockPool.has.mockReturnValue(true)
    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444'
    })

    await manager.start()
    await manager.acquire('node-1')
    mockConnection.publish.mockClear()

    emitConnectionStatus('error')
    emitConnectionStatus('connected')
    await Promise.resolve()
    await Promise.resolve()

    expect(manager.lastReconciliationReport).toMatchObject({
      reason: 'reconnect',
      repairedNodeIds: ['node-1'],
      skippedNodeIds: []
    })
    expect(mockConnection.publish).toHaveBeenCalledWith('xnet-doc-node-1', {
      type: 'sync-step1',
      from: expect.any(String),
      sv: expect.any(String)
    })
  })

  it('clears remote awareness when the connection drops', async () => {
    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444'
    })

    await manager.start()
    await manager.acquire('node-1')

    const awareness = manager.getAwareness('node-1')
    expect(awareness).not.toBeNull()

    const remoteDoc = new Y.Doc()
    const remoteAwareness = new Awareness(remoteDoc)
    remoteAwareness.setLocalStateField('user', { name: 'Peer' })
    const remoteUpdate = encodeAwarenessUpdate(remoteAwareness, [remoteAwareness.clientID])

    awareness!.setLocalStateField('user', { name: 'Local' })
    applyAwarenessUpdate(awareness!, remoteUpdate, 'remote')

    const statesBefore = Array.from(awareness!.getStates().keys())
    expect(statesBefore).toContain(awareness!.clientID)
    expect(statesBefore).toContain(remoteAwareness.clientID)

    emitConnectionStatus('error')

    const remainingClientIds = Array.from(awareness!.getStates().keys())
    expect(remainingClientIds).toEqual([awareness!.clientID])
  })

  it('returns the local doc without blocking on the hub subscription (0188)', async () => {
    // A subscription confirmation that never arrives. With the old
    // `await joinNodeRoom`, acquire() would hang here (up to the real 5s
    // connection timeout); local-first requires it to resolve immediately.
    const readyGate = createDeferred<void>()
    roomReadyPromise = readyGate.promise

    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444'
    })

    await manager.start()
    emitConnectionStatus('connected')

    // Resolves to the local doc even though the room subscription is unconfirmed.
    const doc = await manager.acquire('node-1')
    expect(doc).toBe(sharedDoc)

    // The background join started (handler registered synchronously)...
    expect(roomHandlers.has('xnet-doc-node-1')).toBe(true)
    // ...but no sync-step1 yet, because the subscription is still pending.
    expect(
      mockConnection.publish.mock.calls.filter(([, data]) => data?.type === 'sync-step1')
    ).toHaveLength(0)

    // Once the hub confirms the subscription, the background join performs
    // catch-up sync — proving the round-trip moved off the critical path.
    mockPool.has.mockReturnValue(true)
    readyGate.resolve()
    await vi.waitFor(() => {
      expect(
        mockConnection.publish.mock.calls.filter(([, data]) => data?.type === 'sync-step1')
      ).not.toHaveLength(0)
    })
  })

  it('[bench] opening many documents stays local-first under a slow hub (0188)', async () => {
    // The hub is connected but never confirms subscriptions — the exact case
    // that used to make every document open block up to the 5s timeout. With a
    // background join, acquire() resolves at local-read speed.
    const readyGate = createDeferred<void>()
    roomReadyPromise = readyGate.promise

    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444'
    })

    await manager.start()
    emitConnectionStatus('connected')

    const DOC_COUNT = 50
    const startedAt = performance.now()
    for (let i = 0; i < DOC_COUNT; i++) {
      await manager.acquire(`node-${i}`)
    }
    const elapsed = performance.now() - startedAt
    const perDoc = elapsed / DOC_COUNT

    // eslint-disable-next-line no-console
    console.log(
      `[bench] opened ${DOC_COUNT} docs in ${elapsed.toFixed(1)}ms ` +
        `(${perDoc.toFixed(2)}ms/doc) with hub subscriptions unconfirmed`
    )

    // Pre-fix, each acquire awaited up to the 5s subscription timeout, so this
    // batch would have taken ~DOC_COUNT × 5s (and timed out the test). Local-
    // first keeps the whole batch in the low-ms range — a generous bound that
    // still proves the round-trip is off the critical path.
    expect(elapsed).toBeLessThan(1000)

    readyGate.resolve()
  })

  it('signs outgoing sync updates by default', async () => {
    const identity = generateIdentity()
    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444',
      authorDID: identity.identity.did,
      signingKey: identity.privateKey
    })

    await manager.start()
    emitConnectionStatus('connected')
    await manager.acquire('node-1')

    sharedDoc.getText('content').insert(0, 'signed')

    const syncUpdateCall = mockConnection.publish.mock.calls.find(
      ([, data]) => data?.type === 'sync-update'
    )
    expect(syncUpdateCall).toBeDefined()
    expect(syncUpdateCall?.[1]).toMatchObject({
      type: 'sync-update',
      envelope: expect.objectContaining({
        authorDID: identity.identity.did,
        signature: expect.any(String)
      })
    })
    expect(syncUpdateCall?.[1].update).toBeUndefined()
  })

  it('rejects unsigned incoming updates by default', async () => {
    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444'
    })

    await manager.start()
    await manager.acquire('node-1')

    const baseline = sharedDoc.getText('content').toString()
    await roomHandlers.get('xnet-doc-node-1')?.({
      type: 'sync-update',
      from: 'peer-1',
      update: btoa(String.fromCharCode(1, 2, 3))
    })

    expect(sharedDoc.getText('content').toString()).toBe(baseline)
  })

  it('accepts unsigned incoming updates only in explicit compatibility mode', async () => {
    const sourceDoc = new Y.Doc()
    sourceDoc.getText('content').insert(0, 'legacy')

    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444',
      replication: {
        compatibility: {
          allowUnsignedReplication: true
        }
      }
    })

    await manager.start()
    await manager.acquire('node-1')

    await roomHandlers.get('xnet-doc-node-1')?.({
      type: 'sync-update',
      from: 'peer-legacy',
      update: btoa(String.fromCharCode(...Y.encodeStateAsUpdate(sourceDoc)))
    })

    expect(sharedDoc.getText('content').toString()).toBe('legacy')
  })

  it('accepts valid signed incoming updates', async () => {
    const identity = generateIdentity()
    const sourceDoc = new Y.Doc()
    sourceDoc.getText('content').insert(0, 'remote')
    const update = Y.encodeStateAsUpdate(sourceDoc)
    const envelope = signYjsUpdate(update, identity.identity.did, identity.privateKey, 7)

    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444'
    })

    await manager.start()
    await manager.acquire('node-1')

    await roomHandlers.get('xnet-doc-node-1')?.({
      type: 'sync-update',
      from: 'peer-signed',
      envelope: {
        update: btoa(String.fromCharCode(...envelope.update)),
        authorDID: envelope.authorDID,
        signature: btoa(String.fromCharCode(...envelope.signature)),
        timestamp: envelope.timestamp,
        clientId: envelope.clientId
      }
    })

    expect(sharedDoc.getText('content').toString()).toBe('remote')
  })

  it('converges after duplicate and out-of-order signed updates', async () => {
    const identity = generateIdentity()
    const sourceDoc = new Y.Doc()
    const initialStateVector = Y.encodeStateVector(sourceDoc)
    sourceDoc.getText('content').insert(0, 'A')
    const updateA = Y.encodeStateAsUpdate(sourceDoc, initialStateVector)
    const afterAStateVector = Y.encodeStateVector(sourceDoc)
    sourceDoc.getText('content').insert(1, 'B')
    const updateB = Y.encodeStateAsUpdate(sourceDoc, afterAStateVector)
    const envelopeA = signYjsUpdate(updateA, identity.identity.did, identity.privateKey, 7)
    const envelopeB = signYjsUpdate(updateB, identity.identity.did, identity.privateKey, 7)
    const manager = createSyncManager({
      nodeStore: {} as NodeStore,
      storage: {} as NodeStorageAdapter,
      signalingUrl: 'ws://localhost:4444'
    })
    const toWireEnvelope = (envelope: typeof envelopeA) => ({
      update: btoa(String.fromCharCode(...envelope.update)),
      authorDID: envelope.authorDID,
      signature: btoa(String.fromCharCode(...envelope.signature)),
      timestamp: envelope.timestamp,
      clientId: envelope.clientId
    })

    await manager.start()
    await manager.acquire('node-1')

    await roomHandlers.get('xnet-doc-node-1')?.({
      type: 'sync-update',
      from: 'peer-signed',
      envelope: toWireEnvelope(envelopeB)
    })
    await roomHandlers.get('xnet-doc-node-1')?.({
      type: 'sync-update',
      from: 'peer-signed',
      envelope: toWireEnvelope(envelopeA)
    })
    await roomHandlers.get('xnet-doc-node-1')?.({
      type: 'sync-update',
      from: 'peer-signed',
      envelope: toWireEnvelope(envelopeA)
    })

    expect(sharedDoc.getText('content').toString()).toBe('AB')
  })
})
