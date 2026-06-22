import type { ConnectionManager, ConnectionStatus } from './connection-manager'
import type { ContentId, DID } from '@xnetjs/core'
import type { NodeChange, NodeStore, SchemaIRI } from '@xnetjs/data'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeStoreSyncProvider } from './node-store-sync-provider'

const SYNC_RESPONSE_TIMEOUT_MS = 4000
const SEND_WINDOW_MS = 1000
const MAX_SENDS_PER_WINDOW = 40

function makeChange(lamport: number): NodeChange {
  return {
    id: `change-${lamport}`,
    type: 'node-change',
    payload: {
      nodeId: `node-${lamport}`,
      schemaId: 'xnet://xnet.fyi/SchemaDefinition@1.0.0' as SchemaIRI,
      properties: { n: lamport }
    },
    hash: `cid:blake3:change-${lamport}` as ContentId,
    parentHash: null,
    authorDID: 'did:key:z6MkAuthor' as DID,
    signature: new Uint8Array([1, 2, 3]),
    wallTime: 1710000000000 + lamport,
    lamport: lamport
  }
}

function makeStore(opts: { changes?: NodeChange[]; cursor?: number } = {}) {
  let listener: ((event: { change: NodeChange; isRemote: boolean }) => void) | null = null
  const setSyncCursor = vi.fn(async () => undefined)
  const getChangesSince = vi.fn(async () => opts.changes ?? [])
  const getSyncCursor = vi.fn(async () => opts.cursor ?? 0)
  const store = {
    subscribe: vi.fn((l: (event: { change: NodeChange; isRemote: boolean }) => void) => {
      listener = l
      return vi.fn()
    }),
    getChangesSince,
    getSyncCursor,
    setSyncCursor,
    applyRemoteChange: vi.fn(async () => undefined),
    applyRemoteChanges: vi.fn(async () => undefined)
  } as unknown as NodeStore
  return {
    store,
    getChangesSince,
    getSyncCursor,
    setSyncCursor,
    emit: (event: { change: NodeChange; isRemote: boolean }) => listener?.(event)
  }
}

function makeConnection(initialStatus: ConnectionStatus = 'connected') {
  let status = initialStatus
  const statusHandlers: Array<(s: ConnectionStatus) => void> = []
  const messageHandlers: Array<(m: Record<string, unknown>) => void> = []
  const roomHandlers = new Map<string, (data: Record<string, unknown>) => void>()
  const conn = {
    get status() {
      return status
    },
    joinRoom: vi.fn((room: string, h: (data: Record<string, unknown>) => void) => {
      roomHandlers.set(room, h)
      return vi.fn()
    }),
    onMessage: vi.fn((h: (m: Record<string, unknown>) => void) => {
      messageHandlers.push(h)
      return vi.fn()
    }),
    onStatus: vi.fn((h: (s: ConnectionStatus) => void) => {
      statusHandlers.push(h)
      return vi.fn()
    }),
    publish: vi.fn(),
    sendRaw: vi.fn(),
    joinRoomAsync: vi.fn(),
    leaveRoom: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    roomCount: 0
  } as unknown as ConnectionManager
  return {
    conn,
    setStatus(s: ConnectionStatus) {
      status = s
      statusHandlers.forEach((h) => h(s))
    },
    injectMessage(m: Record<string, unknown>) {
      messageHandlers.forEach((h) => h(m))
    },
    injectRoomMessage(room: string, data: Record<string, unknown>) {
      roomHandlers.get(room)?.(data)
    }
  }
}

describe('NodeStoreSyncProvider', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  describe('serialization', () => {
    it('publishes node changes with schemaId to the relay room', async () => {
      const { store, emit } = makeStore()
      const { conn } = makeConnection('connected')
      const provider = new NodeStoreSyncProvider(store, 'did:key:z6MkAuthor')
      provider.attach(conn)
      emit({ change: makeChange(1), isRemote: false })
      await vi.advanceTimersByTimeAsync(0) // drain the throttle queue

      expect(conn.publish).toHaveBeenCalledWith('did:key:z6MkAuthor', {
        type: 'node-change',
        room: 'did:key:z6MkAuthor',
        change: expect.objectContaining({ type: 'node-change', nodeId: 'node-1', lamportTime: 1 })
      })
    })

    it('carries protocolVersion across the wire (part of the hashed fields)', async () => {
      const { store, emit } = makeStore()
      const { conn } = makeConnection('connected')
      const provider = new NodeStoreSyncProvider(store, 'room-1')
      provider.attach(conn)
      emit({ change: { ...makeChange(1), protocolVersion: 1 }, isRemote: false })
      await vi.advanceTimersByTimeAsync(0)

      expect(conn.publish).toHaveBeenCalledWith('room-1', {
        type: 'node-change',
        room: 'room-1',
        change: expect.objectContaining({ protocolVersion: 1 })
      })
    })

    it('does not rebroadcast remote changes', async () => {
      const { store, emit } = makeStore()
      const { conn } = makeConnection('connected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)
      emit({ change: makeChange(1), isRemote: true })
      await vi.advanceTimersByTimeAsync(SEND_WINDOW_MS)
      expect(conn.publish).not.toHaveBeenCalled()
    })
  })

  describe('request-sync-first + persisted cursor (0206)', () => {
    it('loads the persisted cursor and requests sync from it before pushing', async () => {
      const { store, getChangesSince } = makeStore({ changes: [makeChange(5)], cursor: 3 })
      const { conn, setStatus } = makeConnection('disconnected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)

      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)

      // request-first: ask the hub from the PERSISTED cursor, don't push yet.
      expect(conn.sendRaw).toHaveBeenCalledWith({
        type: 'node-sync-request',
        room: 'room-1',
        sinceLamport: 3
      })
      expect(getChangesSince).not.toHaveBeenCalled()
    })

    it('pushes local changes only after the hub responds', async () => {
      const { store, getChangesSince } = makeStore({ changes: [makeChange(5)], cursor: 0 })
      const { conn, setStatus, injectMessage } = makeConnection('disconnected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)

      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      expect(getChangesSince).not.toHaveBeenCalled()

      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 0 })
      await vi.advanceTimersByTimeAsync(0)
      expect(getChangesSince).toHaveBeenCalledWith(0)
      await vi.advanceTimersByTimeAsync(0)
      expect(conn.publish).toHaveBeenCalledTimes(1)
    })

    it('falls back to pushing after a timeout when the hub never responds', async () => {
      const { store, getChangesSince } = makeStore({ changes: [makeChange(5)], cursor: 0 })
      const { conn, setStatus } = makeConnection('disconnected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)

      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      expect(getChangesSince).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(SYNC_RESPONSE_TIMEOUT_MS)
      expect(getChangesSince).toHaveBeenCalled()
    })

    it('persists the confirmed cursor from the hub high-water mark', async () => {
      const { store, setSyncCursor } = makeStore({ cursor: 0 })
      const { conn, setStatus, injectMessage } = makeConnection('disconnected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)

      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 9 })
      await vi.advanceTimersByTimeAsync(0)

      expect(setSyncCursor).toHaveBeenCalledWith('room-1', 9)
    })
  })

  describe('outbound throttle (0206)', () => {
    it('caps node-change publishes per window and drains the rest later', async () => {
      const changes = Array.from({ length: 100 }, (_, i) => makeChange(i + 1))
      const { store } = makeStore({ changes, cursor: 0 })
      const { conn, setStatus, injectMessage } = makeConnection('disconnected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)

      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 0 })
      await vi.advanceTimersByTimeAsync(0) // getChangesSince resolves → enqueue 100
      await vi.advanceTimersByTimeAsync(0) // first drain window

      expect((conn.publish as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        MAX_SENDS_PER_WINDOW
      )

      await vi.advanceTimersByTimeAsync(SEND_WINDOW_MS)
      expect((conn.publish as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        2 * MAX_SENDS_PER_WINDOW
      )

      await vi.advanceTimersByTimeAsync(SEND_WINDOW_MS)
      expect((conn.publish as ReturnType<typeof vi.fn>).mock.calls.length).toBe(100)
    })
  })

  describe('resilience (0206)', () => {
    it('restores a missing payload schemaId from the top-level field on deserialize', async () => {
      const { store } = makeStore()
      const applyRemoteChange = vi.fn(async () => undefined)
      ;(store as unknown as { applyRemoteChange: typeof applyRemoteChange }).applyRemoteChange =
        applyRemoteChange
      const { conn, injectRoomMessage } = makeConnection('connected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)

      injectRoomMessage('room-1', {
        type: 'node-change',
        change: {
          id: 'c1',
          type: 'node-change',
          hash: 'cid:blake3:c1',
          room: 'room-1',
          nodeId: 'n1',
          schemaId: 'xnet://xnet.fyi/Task@1.0.0', // present at top level…
          lamportTime: 1,
          lamportAuthor: 'did:key:z6MkAuthor',
          authorDid: 'did:key:z6MkAuthor',
          wallTime: 1,
          parentHash: null,
          payload: { nodeId: 'n1', properties: {} }, // …but missing from the payload
          signatureB64: 'AQID'
        }
      })
      await vi.advanceTimersByTimeAsync(0)

      expect(applyRemoteChange).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ schemaId: 'xnet://xnet.fyi/Task@1.0.0' })
        })
      )
    })

    it('logs and ignores a node-error from the hub (does not throw)', async () => {
      const { store } = makeStore()
      const { conn, injectMessage } = makeConnection('connected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      expect(() =>
        injectMessage({ type: 'node-error', code: 'INVALID_CHANGE', error: 'nope' })
      ).not.toThrow()
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })
  })
})
