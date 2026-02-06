import type { SerializedNodeChange } from '../src/storage/interface'
import type { DID } from '@xnet/core'
import { bytesToBase64, generateSigningKeyPair } from '@xnet/crypto'
import { identityFromPrivateKey } from '@xnet/identity'
import { createUnsignedChange, signChange, createChangeId } from '@xnet/sync'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocket } from 'ws'
import { createHub, type HubInstance } from '../src'

const PORT = 14461
const ROOM = 'workspace-test-1'

const connect = (port: number): Promise<WebSocket> =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`)
    ws.on('open', () => {
      // Wait for and consume the handshake message
      ws.once('message', () => {
        resolve(ws)
      })
    })
  })

const waitForMessage = (ws: WebSocket): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 2000)
    ws.once('message', (data) => {
      clearTimeout(timeout)
      resolve(JSON.parse(data.toString()))
    })
  })

const makeSerializedChange = (
  overrides: Partial<SerializedNodeChange> = {}
): SerializedNodeChange => {
  const { privateKey } = generateSigningKeyPair()
  const identity = identityFromPrivateKey(privateKey)
  const unsigned = createUnsignedChange({
    id: createChangeId(),
    type: 'node-change',
    payload: {
      nodeId: 'node-1',
      schemaId: 'xnet://xnet.dev/Task',
      properties: { title: 'Test Task', status: 'todo' }
    },
    parentHash: null,
    authorDID: identity.did as DID,
    wallTime: Date.now(),
    lamport: { time: 1, author: identity.did as DID }
  })

  const signed = signChange(unsigned, privateKey)

  return {
    id: signed.id,
    type: signed.type,
    hash: signed.hash,
    room: ROOM,
    nodeId: signed.payload.nodeId,
    schemaId: signed.payload.schemaId,
    lamportTime: signed.lamport.time,
    lamportAuthor: signed.lamport.author,
    authorDid: signed.authorDID,
    wallTime: signed.wallTime,
    parentHash: signed.parentHash,
    payload: signed.payload,
    signatureB64: bytesToBase64(signed.signature),
    protocolVersion: signed.protocolVersion,
    batchId: signed.batchId,
    batchIndex: signed.batchIndex,
    batchSize: signed.batchSize,
    ...overrides
  }
}

describe('Node Sync Relay', () => {
  let hub: HubInstance

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('persists node-change and serves sync-response', async () => {
    const wsA = await connect(PORT)
    const wsB = await connect(PORT)

    const change = makeSerializedChange()

    wsA.send(
      JSON.stringify({
        type: 'publish',
        topic: ROOM,
        data: {
          type: 'node-change',
          room: ROOM,
          change
        }
      })
    )

    await new Promise((resolve) => setTimeout(resolve, 50))

    wsB.send(JSON.stringify({ type: 'node-sync-request', room: ROOM, sinceLamport: 0 }))

    const response = (await waitForMessage(wsB)) as {
      type: string
      changes?: SerializedNodeChange[]
    }

    expect(response.type).toBe('node-sync-response')
    expect(response.changes?.length).toBe(1)
    expect(response.changes?.[0].hash).toBe(change.hash)

    wsA.close()
    wsB.close()
  })

  it('deduplicates identical changes by hash', async () => {
    const ws = await connect(PORT)

    const change = makeSerializedChange()

    for (let i = 0; i < 2; i++) {
      ws.send(
        JSON.stringify({
          type: 'publish',
          topic: ROOM,
          data: {
            type: 'node-change',
            room: ROOM,
            change
          }
        })
      )
    }

    await new Promise((resolve) => setTimeout(resolve, 50))

    ws.send(JSON.stringify({ type: 'node-sync-request', room: ROOM, sinceLamport: 0 }))

    const response = (await waitForMessage(ws)) as {
      type: string
      changes?: SerializedNodeChange[]
    }

    expect(response.type).toBe('node-sync-response')
    expect(response.changes?.filter((c) => c.hash === change.hash).length).toBe(1)

    ws.close()
  })
})
