import type { HubInstance } from '../src/index'
import { generateIdentity } from '@xnetjs/identity'
import { signYjsUpdate } from '@xnetjs/sync'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import * as Y from 'yjs'
import { createHub } from '../src/index'

describe('Sync Relay', () => {
  let hub: HubInstance
  const PORT = 14446

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  const connect = async (): Promise<WebSocket> =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`)
      ws.on('open', () => resolve(ws))
    })

  it('persists sync-update and serves to new client', async () => {
    const docId = 'test-relay-1'
    const room = `xnet-doc-${docId}`

    const wsA = await connect()
    wsA.send(JSON.stringify({ type: 'subscribe', topics: [room] }))
    await new Promise((resolve) => setTimeout(resolve, 50))

    const docA = new Y.Doc()
    docA.getText('content').insert(0, 'Hello from A')
    const update = Y.encodeStateAsUpdate(docA)
    const identity = generateIdentity()
    const envelope = signYjsUpdate(
      update,
      identity.identity.did,
      identity.privateKey,
      docA.clientID
    )

    wsA.send(
      JSON.stringify({
        type: 'publish',
        topic: room,
        data: {
          type: 'sync-update',
          from: 'clientA',
          envelope: {
            update: Buffer.from(envelope.update).toString('base64'),
            authorDID: envelope.authorDID,
            signature: Buffer.from(envelope.signature).toString('base64'),
            timestamp: envelope.timestamp,
            clientId: envelope.clientId
          }
        }
      })
    )

    // Give hub time to persist the update (reduced from 1200ms)
    await new Promise((resolve) => setTimeout(resolve, 200))
    wsA.close()

    const wsB = await connect()
    wsB.send(JSON.stringify({ type: 'subscribe', topics: [room] }))

    const emptyDoc = new Y.Doc()
    const sv = Y.encodeStateVector(emptyDoc)
    wsB.send(
      JSON.stringify({
        type: 'publish',
        topic: room,
        data: { type: 'sync-step1', from: 'clientB', sv: Buffer.from(sv).toString('base64') }
      })
    )

    const msg = await new Promise<{ envelope: Record<string, unknown> }>((resolve) => {
      wsB.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString()) as { data?: { type?: string; from?: string } }
        const data = parsed.data as {
          type?: string
          from?: string
          envelope?: Record<string, unknown>
        }
        if (data?.type === 'sync-step2' && data?.from === 'hub-relay') {
          resolve({ envelope: data.envelope as Record<string, unknown> })
        }
      })
    })

    const hubUpdate = Buffer.from(msg.envelope.update as string, 'base64')
    Y.applyUpdate(emptyDoc, new Uint8Array(hubUpdate))
    expect(emptyDoc.getText('content').toString()).toBe('Hello from A')

    wsB.close()
  })

  it('rejects unsigned sync updates by default', async () => {
    const docId = 'test-relay-unsigned'
    const room = `xnet-doc-${docId}`

    const wsA = await connect()
    wsA.send(JSON.stringify({ type: 'subscribe', topics: [room] }))
    await new Promise((resolve) => setTimeout(resolve, 50))

    const docA = new Y.Doc()
    docA.getText('content').insert(0, 'unsigned content')
    const update = Y.encodeStateAsUpdate(docA)

    wsA.send(
      JSON.stringify({
        type: 'publish',
        topic: room,
        data: {
          type: 'sync-update',
          from: 'clientA',
          update: Buffer.from(update).toString('base64')
        }
      })
    )

    await new Promise((resolve) => setTimeout(resolve, 200))
    wsA.close()

    const wsB = await connect()
    wsB.send(JSON.stringify({ type: 'subscribe', topics: [room] }))

    const emptyDoc = new Y.Doc()
    const sv = Y.encodeStateVector(emptyDoc)
    wsB.send(
      JSON.stringify({
        type: 'publish',
        topic: room,
        data: { type: 'sync-step1', from: 'clientB', sv: Buffer.from(sv).toString('base64') }
      })
    )

    const received = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 250)
      wsB.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString()) as { data?: { type?: string; from?: string } }
        const data = parsed.data as { type?: string; from?: string }
        if (data?.type === 'sync-step2' && data?.from === 'hub-relay') {
          clearTimeout(timer)
          resolve(true)
        }
      })
    })

    expect(received).toBe(false)
    wsB.close()
  })
})

describe('Sync Relay compatibility mode', () => {
  let hub: HubInstance
  const PORT = 14447

  beforeAll(async () => {
    hub = await createHub({
      port: PORT,
      auth: false,
      storage: 'memory',
      sync: {
        compatibility: {
          allowUnsignedReplication: true
        }
      }
    })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  const connect = async (): Promise<WebSocket> =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`)
      ws.on('open', () => resolve(ws))
    })

  it('accepts unsigned updates only with explicit compatibility mode', async () => {
    const docId = 'test-relay-compat'
    const room = `xnet-doc-${docId}`

    const wsA = await connect()
    wsA.send(JSON.stringify({ type: 'subscribe', topics: [room] }))
    await new Promise((resolve) => setTimeout(resolve, 50))

    const docA = new Y.Doc()
    docA.getText('content').insert(0, 'legacy compatibility')
    const update = Y.encodeStateAsUpdate(docA)

    wsA.send(
      JSON.stringify({
        type: 'publish',
        topic: room,
        data: {
          type: 'sync-update',
          from: 'clientA',
          update: Buffer.from(update).toString('base64')
        }
      })
    )

    await new Promise((resolve) => setTimeout(resolve, 200))
    wsA.close()

    const wsB = await connect()
    wsB.send(JSON.stringify({ type: 'subscribe', topics: [room] }))

    const emptyDoc = new Y.Doc()
    const sv = Y.encodeStateVector(emptyDoc)
    wsB.send(
      JSON.stringify({
        type: 'publish',
        topic: room,
        data: { type: 'sync-step1', from: 'clientB', sv: Buffer.from(sv).toString('base64') }
      })
    )

    const msg = await new Promise<{ envelope: Record<string, unknown> }>((resolve) => {
      wsB.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString()) as { data?: { type?: string; from?: string } }
        const data = parsed.data as {
          type?: string
          from?: string
          envelope?: Record<string, unknown>
        }
        if (data?.type === 'sync-step2' && data?.from === 'hub-relay') {
          resolve({ envelope: data.envelope as Record<string, unknown> })
        }
      })
    })

    const hubUpdate = Buffer.from(msg.envelope.update as string, 'base64')
    Y.applyUpdate(emptyDoc, new Uint8Array(hubUpdate))
    expect(emptyDoc.getText('content').toString()).toBe('legacy compatibility')

    wsB.close()
  })
})
