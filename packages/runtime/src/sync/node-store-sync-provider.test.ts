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

  describe('subscribe-only share rooms (0298)', () => {
    it('never publishes local changes into a share room (hub owns fan-out)', async () => {
      const { store, emit } = makeStore()
      const { conn } = makeConnection('connected')
      const provider = new NodeStoreSyncProvider(store, 'xnet-channel-c1', true)
      provider.attach(conn)
      emit({ change: makeChange(1), isRemote: false })
      await vi.advanceTimersByTimeAsync(0)
      // A normal provider would publish here; a subscribe-only one must not.
      expect(conn.publish).not.toHaveBeenCalled()
    })

    it('applies remote changes received from the share room', async () => {
      const { store } = makeStore()
      const applyRemoteChange = vi.fn(async () => undefined)
      ;(store as unknown as { applyRemoteChange: typeof applyRemoteChange }).applyRemoteChange =
        applyRemoteChange
      const { conn, injectRoomMessage } = makeConnection('connected')
      new NodeStoreSyncProvider(store, 'xnet-channel-c1', true).attach(conn)

      injectRoomMessage('xnet-channel-c1', {
        type: 'node-change',
        change: {
          id: 'c1',
          type: 'node-change',
          hash: 'cid:blake3:c1',
          room: 'xnet-channel-c1',
          nodeId: 'n1',
          schemaId: 'xnet://xnet.fyi/ChatMessage@1.0.0',
          lamportTime: 9,
          lamportAuthor: 'did:key:z6MkAuthor',
          authorDid: 'did:key:z6MkAuthor',
          wallTime: 1,
          parentHash: null,
          payload: { nodeId: 'n1', properties: { body: 'hi' } },
          signatureB64: 'AQID'
        }
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(applyRemoteChange).toHaveBeenCalled()
    })
  })

  describe('draft privacy exclusion (0329)', () => {
    it('shouldPublish=false keeps live changes out of the room', async () => {
      const { store, emit } = makeStore()
      const { conn } = makeConnection('connected')
      const draftPrivate = new Set(['node-1'])
      const provider = new NodeStoreSyncProvider(
        store,
        'user-room',
        false,
        (change) => !draftPrivate.has(change.payload.nodeId)
      )
      provider.attach(conn)

      emit({ change: makeChange(1), isRemote: false }) // draft-private
      emit({ change: makeChange(2), isRemote: false }) // publishable
      await vi.advanceTimersByTimeAsync(0)

      const published = (conn.publish as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c[1])
        .filter((m: { type?: string }) => m?.type === 'node-change')
      expect(published).toHaveLength(1)
      expect((published[0] as { change: { nodeId: string } }).change.nodeId).toBe('node-2')
    })

    it('shouldPublish also filters the cursor backfill replay', async () => {
      const changes = [makeChange(1), makeChange(2), makeChange(3)]
      const { store } = makeStore({ changes, cursor: 0 })
      const { conn, setStatus, injectMessage } = makeConnection('disconnected')
      new NodeStoreSyncProvider(
        store,
        'room-1',
        false,
        (change) => change.payload.nodeId !== 'node-2'
      ).attach(conn)

      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 0 })
      await vi.advanceTimersByTimeAsync(0)

      const published = (conn.publish as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c[1])
        .filter((m: { type?: string }) => m?.type === 'node-change')
        .map((m: { change: { nodeId: string } }) => m.change.nodeId)
      expect(published).toEqual(['node-1', 'node-3'])
    })
  })

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

  describe('clearRoom (reset my data)', () => {
    it('sends node-clear, resolves with the hub count, and resets the cursor', async () => {
      const { store, setSyncCursor } = makeStore({ cursor: 318063 })
      const { conn, injectMessage } = makeConnection('connected')
      const provider = new NodeStoreSyncProvider(store, 'did:key:z6MkAuthor')
      provider.attach(conn)

      const cleared = provider.clearRoom()
      expect(conn.sendRaw).toHaveBeenCalledWith({
        type: 'node-clear',
        room: 'did:key:z6MkAuthor'
      })

      // The hub acknowledges with a count.
      injectMessage({ type: 'node-cleared', room: 'did:key:z6MkAuthor', cleared: 42 })
      await expect(cleared).resolves.toBe(42)

      // The local cursor is reset so a later sync re-pulls from scratch.
      expect(setSyncCursor).toHaveBeenCalledWith('did:key:z6MkAuthor', 0)
    })

    it('ignores node-cleared for a different room', async () => {
      const { store } = makeStore()
      const { conn, injectMessage } = makeConnection('connected')
      const provider = new NodeStoreSyncProvider(store, 'room-mine')
      provider.attach(conn)

      const cleared = provider.clearRoom()
      injectMessage({ type: 'node-cleared', room: 'someone-elses-room', cleared: 99 })
      // Still pending — only our room's ack resolves it; the timeout falls back to 0.
      await vi.advanceTimersByTimeAsync(SYNC_RESPONSE_TIMEOUT_MS)
      await expect(cleared).resolves.toBe(0)
    })

    it('returns 0 immediately when offline (nothing to clear)', async () => {
      const { store } = makeStore()
      const { conn } = makeConnection('disconnected')
      const provider = new NodeStoreSyncProvider(store, 'room-1')
      provider.attach(conn)
      await expect(provider.clearRoom()).resolves.toBe(0)
      expect(conn.sendRaw).not.toHaveBeenCalled()
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

  describe('outbound resync batching (0253)', () => {
    // A change with an explicit author + unique identity, so equal-lamport
    // changes from different authors don't collide on hash (which would dedup).
    function changeBy(lamport: number, author: string, tag: string): NodeChange {
      return {
        id: `change-${tag}`,
        type: 'node-change',
        payload: {
          nodeId: `node-${tag}`,
          schemaId: 'xnet://xnet.fyi/SchemaDefinition@1.0.0' as SchemaIRI,
          properties: {}
        },
        hash: `cid:blake3:${tag}` as ContentId,
        parentHash: null,
        authorDID: author as DID,
        signature: new Uint8Array([1, 2, 3]),
        wallTime: 1710000000000 + lamport,
        lamport
      }
    }

    it('breaks equal-lamport ties by code-unit author order, not locale', async () => {
      // 'B' (0x42) sorts BEFORE 'a' (0x61) by code unit, but AFTER it under
      // locale collation (case-insensitive primary weight). Supplying them in
      // the locale order proves the sort ran and used code units.
      const upper = changeBy(1, 'did:key:zB', 'upper')
      const lower = changeBy(1, 'did:key:za', 'lower')
      const { store } = makeStore({ changes: [lower, upper], cursor: 0 })
      const { conn, setStatus, injectMessage } = makeConnection('disconnected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)

      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 0 })
      await vi.advanceTimersByTimeAsync(0) // getChangesSince → sort + enqueue
      await vi.advanceTimersByTimeAsync(0) // drain

      const order = (conn.publish as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => (c[1] as { change: { nodeId: string } }).change.nodeId
      )
      expect(order).toEqual(['node-upper', 'node-lower'])
    })

    it('enqueues every change across the yield boundary on a large resync', async () => {
      // > OUTBOUND_ENQUEUE_BATCH (1024) so the enqueue loop yields mid-way; every
      // change must still be published exactly once (no drop/dupe at the seam).
      const N = 1100
      const changes = Array.from({ length: N }, (_, i) => makeChange(i + 1))
      const { store } = makeStore({ changes, cursor: 0 })
      const { conn, setStatus, injectMessage } = makeConnection('disconnected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)

      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 0 })
      // Drain past the enqueue yield and every throttle window.
      await vi.advanceTimersByTimeAsync(60 * SEND_WINDOW_MS)

      const publish = conn.publish as ReturnType<typeof vi.fn>
      expect(publish.mock.calls.length).toBe(N)
      const nodeIds = new Set(
        publish.mock.calls.map((c) => (c[1] as { change: { nodeId: string } }).change.nodeId)
      )
      expect(nodeIds.size).toBe(N)
    })
  })

  describe('rollback guard (0254)', () => {
    it('re-offers local changes when the hub high-water mark regresses below the cursor', async () => {
      const { store, getChangesSince } = makeStore({ changes: [], cursor: 0 })
      const { conn, setStatus, injectMessage } = makeConnection('disconnected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Connect and let the hub confirm up to 100.
      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 100 })
      await vi.advanceTimersByTimeAsync(0)
      getChangesSince.mockClear()

      // The hub rolls back: a later response reports a LOWER mark. The guard
      // drops the push cursor and re-offers the gap from the hub's real mark.
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 50 })
      await vi.advanceTimersByTimeAsync(0)

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('hub rollback'))
      expect(getChangesSince).toHaveBeenCalledWith(50)
      warn.mockRestore()
    })

    it('does not re-offer on normal forward progress', async () => {
      const { store, getChangesSince } = makeStore({ changes: [], cursor: 0 })
      const { conn, setStatus, injectMessage } = makeConnection('disconnected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)

      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 100 })
      await vi.advanceTimersByTimeAsync(0)
      getChangesSince.mockClear()

      // A higher mark is forward progress, never a rollback re-offer.
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 140 })
      await vi.advanceTimersByTimeAsync(0)
      expect(getChangesSince).not.toHaveBeenCalledWith(100)
    })

    it('does not re-offer to a reset/empty hub (highWaterMark 0) — 0260', async () => {
      const { store, getChangesSince } = makeStore({ changes: [], cursor: 0 })
      const { conn, setStatus, injectMessage } = makeConnection('disconnected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)

      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      injectMessage({
        type: 'node-sync-response',
        room: 'room-1',
        changes: [],
        highWaterMark: 318066
      })
      await vi.advanceTimersByTimeAsync(0)
      getChangesSince.mockClear()

      // A fresh/reset tenant hub reports 0 — NOT a recoverable partial rollback.
      // Re-offering here would dump the entire log via getChangesSince(0).
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 0 })
      await vi.advanceTimersByTimeAsync(0)
      expect(getChangesSince).not.toHaveBeenCalled()
    })

    it('does not re-offer while the outbound breaker is halted (INVALID_HASH skew) — 0260', async () => {
      const { store, getChangesSince } = makeStore({ changes: [], cursor: 0 })
      const { conn, setStatus, injectMessage } = makeConnection('disconnected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 100 })
      await vi.advanceTimersByTimeAsync(0)

      // Trip the structural-rejection breaker (5 consecutive INVALID_HASH).
      for (let i = 0; i < 5; i++) {
        injectMessage({ type: 'node-error', code: 'INVALID_HASH', error: 'hash mismatch' })
      }
      getChangesSince.mockClear()

      // A regressed mark arrives while halted — re-offering is futile (every change
      // is rejected identically), so the guard must NOT flood.
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 50 })
      await vi.advanceTimersByTimeAsync(0)
      expect(getChangesSince).not.toHaveBeenCalledWith(50)

      error.mockRestore()
      warn.mockRestore()
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

  describe('protocol-skew circuit breaker', () => {
    const MAX_STRUCTURAL_REJECTIONS = 5

    it('halts outbound sync after repeated structural rejections, then resumes on reconnect', async () => {
      const { store, emit } = makeStore()
      const { conn, setStatus, injectMessage } = makeConnection('connected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // A protocol/build skew rejects every change with INVALID_HASH. After
      // MAX_STRUCTURAL_REJECTIONS in a row the breaker trips with ONE loud error.
      for (let i = 0; i < MAX_STRUCTURAL_REJECTIONS; i++) {
        injectMessage({ type: 'node-error', code: 'INVALID_HASH', error: 'hash mismatch' })
      }
      expect(error).toHaveBeenCalledTimes(1)

      // A fresh local change must NOT be published while halted.
      emit({ change: makeChange(1), isRemote: false })
      await vi.advanceTimersByTimeAsync(0)
      expect(conn.publish).not.toHaveBeenCalled()

      // Reconnect clears the breaker; subsequent local changes flow again.
      setStatus('disconnected')
      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 0 })
      await vi.advanceTimersByTimeAsync(0)
      emit({ change: makeChange(2), isRemote: false })
      await vi.advanceTimersByTimeAsync(0)
      expect(conn.publish).toHaveBeenCalledTimes(1)

      error.mockRestore()
      warn.mockRestore()
    })

    it('does not halt on non-structural rejections (e.g. UNAUTHORIZED)', async () => {
      const { store, emit } = makeStore()
      const { conn, injectMessage } = makeConnection('connected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      for (let i = 0; i < MAX_STRUCTURAL_REJECTIONS * 2; i++) {
        injectMessage({ type: 'node-error', code: 'UNAUTHORIZED', error: 'nope' })
      }
      expect(error).not.toHaveBeenCalled()

      emit({ change: makeChange(1), isRemote: false })
      await vi.advanceTimersByTimeAsync(0)
      expect(conn.publish).toHaveBeenCalledTimes(1)

      error.mockRestore()
      warn.mockRestore()
    })

    it('resets the counter on forward progress so sparse rejections never trip', async () => {
      const { store, emit } = makeStore()
      const { conn, injectMessage } = makeConnection('connected')
      new NodeStoreSyncProvider(store, 'room-1').attach(conn)
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Four rejections (one short of the trip), then forward progress, then
      // four more: the counter reset means the breaker never trips.
      for (let i = 0; i < MAX_STRUCTURAL_REJECTIONS - 1; i++) {
        injectMessage({ type: 'node-error', code: 'INVALID_HASH', error: 'mismatch' })
      }
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 7 })
      await vi.advanceTimersByTimeAsync(0)
      for (let i = 0; i < MAX_STRUCTURAL_REJECTIONS - 1; i++) {
        injectMessage({ type: 'node-error', code: 'INVALID_HASH', error: 'mismatch' })
      }
      expect(error).not.toHaveBeenCalled()

      emit({ change: makeChange(9), isRemote: false })
      await vi.advanceTimersByTimeAsync(0)
      expect(conn.publish).toHaveBeenCalledTimes(1)

      error.mockRestore()
      warn.mockRestore()
    })
  })

  describe('capacity halt (0291 demo quota / disk full)', () => {
    it('halts outbound on the FIRST QUOTA_EXCEEDED and notifies listeners', async () => {
      const { store, emit } = makeStore()
      const { conn, setStatus, injectMessage } = makeConnection('connected')
      const provider = new NodeStoreSyncProvider(store, 'room-1')
      provider.attach(conn)
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const blocked = vi.fn()
      provider.onSyncBlocked(blocked)

      // One rejection is enough: the account stays over quota for every
      // subsequent change, so resending only floods the hub.
      injectMessage({ type: 'node-error', code: 'QUOTA_EXCEEDED', error: 'over 10MB' })
      expect(error).toHaveBeenCalledTimes(1)
      expect(blocked).toHaveBeenCalledWith('QUOTA_EXCEEDED', 'over 10MB')

      // Local changes are still accepted locally but NOT published while halted.
      emit({ change: makeChange(1), isRemote: false })
      await vi.advanceTimersByTimeAsync(0)
      expect(conn.publish).not.toHaveBeenCalled()

      // Reconnect clears the halt (a demo reset / freed disk lifts the cap).
      setStatus('disconnected')
      setStatus('connected')
      await vi.advanceTimersByTimeAsync(0)
      injectMessage({ type: 'node-sync-response', room: 'room-1', changes: [], highWaterMark: 0 })
      await vi.advanceTimersByTimeAsync(0)
      emit({ change: makeChange(2), isRemote: false })
      await vi.advanceTimersByTimeAsync(0)
      expect(conn.publish).toHaveBeenCalledTimes(1)

      error.mockRestore()
      warn.mockRestore()
    })

    it('halts outbound on STORAGE_FULL and unsubscribes listeners cleanly', async () => {
      const { store, emit } = makeStore()
      const { conn, injectMessage } = makeConnection('connected')
      const provider = new NodeStoreSyncProvider(store, 'room-1')
      provider.attach(conn)
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const blocked = vi.fn()
      const unsubscribe = provider.onSyncBlocked(blocked)

      injectMessage({ type: 'node-error', code: 'STORAGE_FULL', error: 'disk full' })
      expect(blocked).toHaveBeenCalledWith('STORAGE_FULL', 'disk full')

      unsubscribe()
      injectMessage({ type: 'node-error', code: 'STORAGE_FULL', error: 'disk full' })
      expect(blocked).toHaveBeenCalledTimes(1)

      emit({ change: makeChange(1), isRemote: false })
      await vi.advanceTimersByTimeAsync(0)
      expect(conn.publish).not.toHaveBeenCalled()

      error.mockRestore()
      warn.mockRestore()
    })
  })
})
