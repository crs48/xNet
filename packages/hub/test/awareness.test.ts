import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocket } from 'ws'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { createHub, type HubInstance } from '../src'
import { AwarenessService } from '../src/services/awareness'
import { createMemoryStorage } from '../src/storage/memory'

const toBase64 = (data: Uint8Array): string => Buffer.from(data).toString('base64')

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

// Short delay for message delivery (replaces longer fixed waits)
const SHORT_WAIT = 30

const connect = (port: number): Promise<WebSocket> =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`)
    ws.on('open', () => resolve(ws))
  })

describe('Awareness Persistence', () => {
  let hub: HubInstance
  const PORT = 14454

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('sends awareness snapshot to new subscriber', async () => {
    const ROOM = 'xnet-doc-awareness-test'

    const wsAlice = await connect(PORT)
    wsAlice.send(JSON.stringify({ type: 'subscribe', topics: [ROOM] }))
    await wait(SHORT_WAIT)

    const doc = new Y.Doc()
    const awareness = new Awareness(doc)
    awareness.setLocalState({
      user: { did: 'did:key:z6MkAlice', name: 'Alice', color: '#e53' },
      cursor: { anchor: 42, head: 42 }
    })

    const update = encodeAwarenessUpdate(awareness, [doc.clientID])
    wsAlice.send(
      JSON.stringify({
        type: 'publish',
        topic: ROOM,
        data: {
          type: 'awareness',
          from: 'peer-alice',
          update: toBase64(update)
        }
      })
    )

    await wait(SHORT_WAIT)
    wsAlice.close()
    await wait(SHORT_WAIT)

    const wsBob = await connect(PORT)
    const snapshotPromise = new Promise<any>((resolve) => {
      wsBob.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg.data?.type === 'awareness-snapshot') {
          resolve(msg.data)
        }
      })
    })

    wsBob.send(JSON.stringify({ type: 'subscribe', topics: [ROOM] }))

    const snapshot = await snapshotPromise
    expect(snapshot.users.length).toBeGreaterThanOrEqual(1)

    const alice = snapshot.users.find((u: any) => u.did === 'did:key:z6MkAlice')
    expect(alice).toBeDefined()
    expect(alice.state.user.name).toBe('Alice')
    expect(alice.lastSeen).toBeGreaterThan(0)

    wsBob.close()
  })

  it('updates awareness on repeated messages', async () => {
    const ROOM = 'xnet-doc-awareness-update'

    const ws = await connect(PORT)
    ws.send(JSON.stringify({ type: 'subscribe', topics: [ROOM] }))
    await wait(SHORT_WAIT)

    const doc = new Y.Doc()
    const awareness = new Awareness(doc)

    awareness.setLocalState({ user: { did: 'did:key:z6MkBob' }, cursor: { anchor: 10, head: 10 } })
    let update = encodeAwarenessUpdate(awareness, [doc.clientID])
    ws.send(
      JSON.stringify({
        type: 'publish',
        topic: ROOM,
        data: { type: 'awareness', update: toBase64(update) }
      })
    )

    await wait(SHORT_WAIT)

    awareness.setLocalState({ user: { did: 'did:key:z6MkBob' }, cursor: { anchor: 50, head: 50 } })
    update = encodeAwarenessUpdate(awareness, [doc.clientID])
    ws.send(
      JSON.stringify({
        type: 'publish',
        topic: ROOM,
        data: { type: 'awareness', update: toBase64(update) }
      })
    )

    await wait(SHORT_WAIT)
    ws.close()
    await wait(SHORT_WAIT)

    const ws2 = await connect(PORT)
    const snapshot = await new Promise<any>((resolve) => {
      ws2.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg.data?.type === 'awareness-snapshot') resolve(msg.data)
      })
      ws2.send(JSON.stringify({ type: 'subscribe', topics: [ROOM] }))
    })

    const bob = snapshot.users.find((u: any) => u.did === 'did:key:z6MkBob')
    expect(bob.state.cursor.anchor).toBe(50)

    ws2.close()
  })

  it('does not send snapshot for empty rooms', async () => {
    const ROOM = 'xnet-doc-empty-room'
    const ws = await connect(PORT)

    let gotSnapshot = false
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.data?.type === 'awareness-snapshot') gotSnapshot = true
    })

    ws.send(JSON.stringify({ type: 'subscribe', topics: [ROOM] }))
    await wait(SHORT_WAIT)

    expect(gotSnapshot).toBe(false)
    ws.close()
  })
})

describe('Awareness admission limits', () => {
  it('rejects oversized encoded awareness updates before persistence', async () => {
    const service = new AwarenessService(createMemoryStorage(), {
      maxUpdateSize: 8,
      rateLimit: { cleanupIntervalMs: 0 }
    })

    const accepted = await service.handleAwarenessMessage('room-oversized-update', 'did:key:user', {
      type: 'awareness',
      from: 'peer-a',
      update: toBase64(new Uint8Array(9))
    })

    expect(accepted).toBe(false)
    expect(await service.getSnapshot('room-oversized-update')).toHaveLength(0)
    service.stop()
  })

  it('rejects oversized direct awareness state before persistence', async () => {
    const service = new AwarenessService(createMemoryStorage(), {
      maxUpdateSize: 32,
      rateLimit: { cleanupIntervalMs: 0 }
    })

    const accepted = await service.handleAwarenessMessage('room-oversized-state', 'did:key:user', {
      type: 'awareness',
      from: 'peer-a',
      state: { user: { did: 'did:key:user' }, bio: 'x'.repeat(128) }
    })

    expect(accepted).toBe(false)
    expect(await service.getSnapshot('room-oversized-state')).toHaveLength(0)
    service.stop()
  })

  it('rate-limits awareness messages by peer', async () => {
    const service = new AwarenessService(createMemoryStorage(), {
      maxUpdateSize: 512,
      rateLimit: {
        maxPerSecond: 1,
        maxPerMinute: 10,
        burstAllowance: 0,
        cleanupIntervalMs: 0
      }
    })

    const first = await service.handleAwarenessMessage('room-rate-limited', 'did:key:user', {
      type: 'awareness',
      from: 'peer-a',
      state: { user: { did: 'did:key:user' }, cursor: { anchor: 1, head: 1 } }
    })
    const second = await service.handleAwarenessMessage('room-rate-limited', 'did:key:user', {
      type: 'awareness',
      from: 'peer-a',
      state: { user: { did: 'did:key:user' }, cursor: { anchor: 2, head: 2 } }
    })

    const snapshot = await service.getSnapshot('room-rate-limited')
    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0].state.cursor).toEqual({ anchor: 1, head: 1 })
    service.stop()
  })
})

describe('Awareness fanout admission', () => {
  let hub: HubInstance
  const PORT = 14456

  beforeAll(async () => {
    hub = await createHub({
      port: PORT,
      auth: false,
      storage: 'memory',
      awarenessMaxUpdateSize: 8
    })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('does not fan out rejected oversized awareness publishes', async () => {
    const ROOM = 'xnet-doc-awareness-oversized-fanout'
    const wsAlice = await connect(PORT)
    const wsBob = await connect(PORT)
    let gotRejectedAwareness = false

    wsBob.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.topic === ROOM && msg.data?.type === 'awareness') {
        gotRejectedAwareness = true
      }
    })

    wsAlice.send(JSON.stringify({ type: 'subscribe', topics: [ROOM] }))
    wsBob.send(JSON.stringify({ type: 'subscribe', topics: [ROOM] }))
    await wait(SHORT_WAIT)

    wsAlice.send(
      JSON.stringify({
        type: 'publish',
        topic: ROOM,
        data: {
          type: 'awareness',
          from: 'peer-alice',
          update: toBase64(new Uint8Array(9))
        }
      })
    )

    await wait(SHORT_WAIT)
    expect(gotRejectedAwareness).toBe(false)

    wsAlice.close()
    wsBob.close()
  })
})
