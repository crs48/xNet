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

  it('forwards unchanged awareness heartbeats so idle call peers stay present', async () => {
    const manager = createIPCSyncManager()
    await manager.acquire('idle-call')
    const awareness = manager.getAwareness('idle-call')!
    awareness.setLocalStateField('communityCall', { session: 'local-session' })
    mockBSM.api.postMessage.mockClear()
    awareness.setLocalState(awareness.getLocalState())
    expect(mockBSM.api.postMessage).toHaveBeenCalledWith(
      'idle-call',
      expect.objectContaining({ type: 'awareness', update: expect.any(Array) })
    )
    manager.release('idle-call')
  })

  it('receives the initial document response during acquisition', async () => {
    const remote = new Y.Doc()
    remote.getText('content').insert(0, 'initial response')
    mockBSM.api.acquire.mockImplementation(async (nodeId) => {
      mockBSM.emitMessage(nodeId, {
        type: 'update',
        update: Array.from(Y.encodeStateAsUpdate(remote))
      })
    })
    const manager = createIPCSyncManager()
    const doc = await manager.acquire('initial-response')
    expect(doc.getText('content').toString()).toBe('initial response')
    manager.release('initial-response')
    remote.destroy()
  })

  it('keeps a shared document alive until the final concurrent consumer releases it', async () => {
    const manager = createIPCSyncManager()
    const [editor, extension] = await Promise.all([
      manager.acquire('shared-page'),
      manager.acquire('shared-page')
    ])
    expect(editor).toBe(extension)
    expect(mockBSM.api.acquire).toHaveBeenCalledTimes(1)
    manager.release('shared-page')
    expect(mockBSM.api.release).not.toHaveBeenCalled()
    extension.getText('content').insert(0, 'still subscribed')
    expect(mockBSM.api.postMessage).toHaveBeenCalledWith(
      'shared-page',
      expect.objectContaining({ type: 'update' })
    )
    expect(await manager.acquire('shared-page')).toBe(extension)
    manager.release('shared-page')
    expect(mockBSM.api.release).not.toHaveBeenCalled()
    manager.release('shared-page')
    expect(mockBSM.api.release).toHaveBeenCalledTimes(1)
    manager.release('shared-page')
    expect(mockBSM.api.release).toHaveBeenCalledTimes(1)
  })

  it('cleans failed acquisitions and permits a later retry', async () => {
    const manager = createIPCSyncManager()
    mockBSM.api.acquire.mockRejectedValueOnce(new Error('connection lost'))
    await expect(manager.acquire('retry-page')).rejects.toThrow('connection lost')
    expect(manager.getAwareness('retry-page')).toBeNull()
    const doc = await manager.acquire('retry-page')
    expect(doc).toBeInstanceOf(Y.Doc)
    manager.release('retry-page')
  })

  it('does not resurrect a document acquired during shutdown', async () => {
    const manager = createIPCSyncManager()
    let finish!: () => void
    mockBSM.api.acquire.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const acquisition = manager.acquire('closing-page')
    const assertion = expect(acquisition).rejects.toThrow('stopped')
    const stopped = manager.stop()
    finish()
    await assertion
    await stopped
    expect(manager.getAwareness('closing-page')).toBeNull()
    expect(mockBSM.api.release).toHaveBeenCalledTimes(1)
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
