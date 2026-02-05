import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocket } from 'ws'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { createHub, type HubInstance } from '../src'

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
