import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { createIPCSyncManager } from './ipc-sync-manager'

type MockStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

type MockAwarenessSnapshot = Array<{
  did: string
  state: {
    user?: { name?: string; color?: string; avatar?: string; did?: string }
    cursor?: { anchor: number; head: number }
    selection?: unknown
    online?: boolean
    [key: string]: unknown
  }
  lastSeen: number
  isStale: boolean
}>

function createMockBSM() {
  let status: MockStatus = 'disconnected'
  const statusHandlers = new Set<(status: MockStatus) => void>()
  const messageHandlers = new Map<string, (data: unknown) => void>()

  const api = {
    start: vi.fn(async () => undefined),
    reconfigure: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    acquire: vi.fn(async (_nodeId: string, _schemaId: string) => undefined),
    release: vi.fn(async (_nodeId: string) => undefined),
    postMessage: vi.fn((_nodeId: string, _data: unknown) => undefined),
    onMessage: vi.fn((nodeId: string, handler: (data: unknown) => void) => {
      messageHandlers.set(nodeId, handler)
      return () => {
        messageHandlers.delete(nodeId)
      }
    }),
    track: vi.fn((_nodeId: string, _schemaId: string) => undefined),
    untrack: vi.fn((_nodeId: string) => undefined),
    getStatus: vi.fn(async () => ({ status })),
    onStatusChange: vi.fn((handler: (nextStatus: MockStatus) => void) => {
      statusHandlers.add(handler)
      return () => {
        statusHandlers.delete(handler)
      }
    }),
    onPeerConnected: vi.fn(() => () => undefined),
    onPeerDisconnected: vi.fn(() => () => undefined),
    requestBlobs: vi.fn(async (_cids: string[]) => undefined),
    announceBlobs: vi.fn((_cids: string[]) => undefined),
    getBlob: vi.fn(async (_cid: string) => null),
    putBlob: vi.fn(async (_data: number[]) => 'cid:mock'),
    hasBlob: vi.fn(async (_cid: string) => false),
    onBlobReceived: vi.fn(() => () => undefined),
    onTransportFallback: vi.fn(() => () => undefined),
    onUnauthorizedUpdate: vi.fn(() => () => undefined),
    setDebug: vi.fn(async (_enabled: boolean) => undefined),
    getDebug: vi.fn(async () => false)
  }

  return {
    api,
    setStatus(nextStatus: MockStatus) {
      status = nextStatus
      for (const handler of statusHandlers) {
        handler(nextStatus)
      }
    },
    emitMessage(
      nodeId: string,
      payload:
        | { type: 'update'; update: number[] }
        | { type: 'awareness'; update: number[] }
        | { type: 'awareness-snapshot'; users: MockAwarenessSnapshot }
        | { type: 'request-awareness' }
    ) {
      messageHandlers.get(nodeId)?.(payload)
    }
  }
}

describe('createIPCSyncManager', () => {
  let mockBSM: ReturnType<typeof createMockBSM>

  beforeEach(() => {
    mockBSM = createMockBSM()
    ;(
      globalThis as unknown as {
        window: {
          xnetBSM: typeof mockBSM.api
        }
      }
    ).window = {
      xnetBSM: mockBSM.api
    }
  })

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  it('derives the shared lifecycle phases from renderer BSM status', async () => {
    const manager = createIPCSyncManager()
    const phases: string[] = [manager.lifecycle.phase]
    const unsubscribe = manager.on('lifecycle', (state) => {
      phases.push(state.phase)
    })

    await manager.start()
    expect(manager.lifecycle.phase).toBe('local-ready')

    mockBSM.setStatus('connecting')
    expect(manager.lifecycle.phase).toBe('connecting')

    mockBSM.setStatus('connected')
    expect(manager.lifecycle.phase).toBe('healthy')

    mockBSM.setStatus('disconnected')
    expect(manager.lifecycle.phase).toBe('degraded')

    await manager.stop()
    expect(manager.lifecycle.phase).toBe('stopped')
    expect(mockBSM.api.release).toHaveBeenCalledTimes(0)

    unsubscribe()

    expect(phases).toEqual([
      'idle',
      'starting',
      'local-ready',
      'connecting',
      'healthy',
      'degraded',
      'stopped'
    ])
  })

  it('applies remote updates and clears remote presence after disconnect', async () => {
    const manager = createIPCSyncManager()
    await manager.start()

    const nodeId = 'page-sync-proof'
    const doc = await manager.acquire(nodeId)
    const awareness = manager.getAwareness(nodeId)
    expect(awareness).not.toBeNull()

    const snapshots: MockAwarenessSnapshot[] = []
    const unsubscribeSnapshot = manager.onAwarenessSnapshot(nodeId, (users) => {
      snapshots.push(users as MockAwarenessSnapshot)
    })

    const remoteDoc = new Y.Doc()
    remoteDoc.getText('content').insert(0, 'hello from peer')
    mockBSM.emitMessage(nodeId, {
      type: 'update',
      update: Array.from(Y.encodeStateAsUpdate(remoteDoc))
    })

    expect(doc.getText('content').toString()).toBe('hello from peer')

    const peerDoc = new Y.Doc()
    const peerAwareness = new Awareness(peerDoc)
    peerAwareness.setLocalStateField('user', {
      name: 'Peer',
      did: 'did:key:z6Mkpeer'
    })
    const peerClientId = peerAwareness.clientID
    const peerUpdate = encodeAwarenessUpdate(peerAwareness, [peerClientId])

    mockBSM.emitMessage(nodeId, {
      type: 'awareness',
      update: Array.from(peerUpdate)
    })

    const remoteClientIds = Array.from(awareness!.getStates().keys()).filter(
      (clientId) => clientId !== awareness!.clientID
    )
    expect(remoteClientIds).toContain(peerClientId)

    mockBSM.emitMessage(nodeId, {
      type: 'awareness-snapshot',
      users: [
        {
          did: 'did:key:z6Mkpeer',
          state: { user: { name: 'Peer', did: 'did:key:z6Mkpeer' } },
          lastSeen: Date.now(),
          isStale: false
        }
      ]
    })

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.[0]?.did).toBe('did:key:z6Mkpeer')

    mockBSM.setStatus('error')

    const clearedRemoteClientIds = Array.from(awareness!.getStates().keys()).filter(
      (clientId) => clientId !== awareness!.clientID
    )
    expect(clearedRemoteClientIds).not.toContain(peerClientId)

    manager.release(nodeId)
    expect(mockBSM.api.release).toHaveBeenCalledWith(nodeId)

    unsubscribeSnapshot()
    await manager.stop()
  })
})
