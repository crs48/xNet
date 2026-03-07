import type { NodeStore, NodeStorageAdapter } from '@xnetjs/data'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
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

const mockConnection = {
  connect: vi.fn(() => {
    emitConnectionStatus('connecting')
  }),
  disconnect: vi.fn(() => {
    emitConnectionStatus('disconnected')
  }),
  joinRoom: vi.fn(() => () => {}),
  joinRoomAsync: vi.fn(() => ({
    unsubscribe: vi.fn(),
    ready: roomReadyPromise
  })),
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
  drain: vi.fn(async () => {
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
  createConnectionManager: vi.fn(() => mockConnection)
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
  NodeStoreSyncProvider: vi.fn().mockImplementation(() => ({
    attach: vi.fn(),
    detach: vi.fn()
  }))
}))

import { createSyncManager } from './sync-manager'

describe('createSyncManager', () => {
  beforeEach(() => {
    currentStatus = 'disconnected'
    roomReadyPromise = Promise.resolve()
    mockOfflineQueueSize = 0
    drainDeferred = null
    connectionStatusListeners.clear()
    sharedDoc = new Y.Doc()

    mockConnection.connect.mockClear()
    mockConnection.disconnect.mockClear()
    mockConnection.joinRoom.mockClear()
    mockConnection.joinRoomAsync.mockClear()
    mockConnection.publish.mockClear()
    mockConnection.onStatus.mockClear()
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
})
