/**
 * Batched node-change push (exploration 0357 Tier 1).
 *
 * The contract under test: a batch frame is a TRANSPORT optimization only.
 * Every change in it is verified, authorized, and stored exactly as if it had
 * arrived alone, and subscribers receive ordinary per-change `node-change`
 * messages so batch-unaware clients are unaffected.
 */
import type { SerializedNodeChange } from '../src/storage/interface'
import type { DID } from '@xnetjs/core'
import { bytesToBase64, generateSigningKeyPair } from '@xnetjs/crypto'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createUnsignedChange, signChange, createChangeId } from '@xnetjs/sync'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocket } from 'ws'
import { createHub, type HubInstance } from '../src'

const PORT = 14481
const ROOM = 'workspace-batch-1'

const connect = (port: number): Promise<{ ws: WebSocket; handshake: Record<string, unknown> }> =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`)
    ws.on('open', () => {
      ws.once('message', (data) => {
        resolve({ ws, handshake: JSON.parse(data.toString()) as Record<string, unknown> })
      })
    })
  })

/** Collect every message that arrives within `windowMs`. */
const collectMessages = (ws: WebSocket, windowMs = 400): Promise<Record<string, unknown>[]> =>
  new Promise((resolve) => {
    const received: Record<string, unknown>[] = []
    const onMessage = (data: Buffer): void => {
      received.push(JSON.parse(data.toString()) as Record<string, unknown>)
    }
    ws.on('message', onMessage)
    setTimeout(() => {
      ws.off('message', onMessage)
      resolve(received)
    }, windowMs)
  })

const signingIdentity = (): { privateKey: Uint8Array; did: DID } => {
  const { privateKey } = generateSigningKeyPair()
  return { privateKey, did: identityFromPrivateKey(privateKey).did as DID }
}

const AUTHOR = signingIdentity()

const makeChange = (
  index: number,
  options: { author?: { privateKey: Uint8Array; did: DID }; corruptSignature?: boolean } = {}
): SerializedNodeChange => {
  const author = options.author ?? AUTHOR
  const payload = {
    nodeId: `batch-node-${index}`,
    schemaId: 'xnet://xnet.dev/Task',
    properties: { title: `Task ${index}`, status: 'todo' }
  }
  const unsigned = createUnsignedChange({
    id: createChangeId(),
    type: 'node-change',
    payload,
    parentHash: null,
    authorDID: author.did,
    wallTime: Date.now(),
    lamport: index + 1
  })
  const signed = signChange(unsigned, author.privateKey)

  return {
    id: signed.id,
    type: signed.type,
    hash: signed.hash,
    room: ROOM,
    nodeId: payload.nodeId,
    schemaId: payload.schemaId,
    lamportTime: signed.lamport,
    lamportAuthor: signed.authorDID,
    authorDid: signed.authorDID,
    wallTime: signed.wallTime,
    parentHash: signed.parentHash,
    payload: signed.payload,
    signatureB64: options.corruptSignature
      ? bytesToBase64(new Uint8Array(64))
      : bytesToBase64(signed.signature),
    protocolVersion: signed.protocolVersion
  }
}

/** Read a room's stored changes back over the wire (the hub exposes no direct storage handle). */
const readStoredChanges = (ws: WebSocket, room: string): Promise<SerializedNodeChange[]> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('sync-response timeout')), 3000)
    const onMessage = (data: Buffer): void => {
      const message = JSON.parse(data.toString()) as {
        type?: string
        changes?: SerializedNodeChange[]
      }
      if (message.type !== 'node-sync-response') return
      clearTimeout(timeout)
      ws.off('message', onMessage)
      resolve(message.changes ?? [])
    }
    ws.on('message', onMessage)
    ws.send(JSON.stringify({ type: 'node-sync-request', room, sinceLamport: 0 }))
  })

const publishBatch = (ws: WebSocket, changes: SerializedNodeChange[], room = ROOM): void => {
  ws.send(
    JSON.stringify({
      type: 'publish',
      topic: room,
      data: { type: 'node-change-batch', room, changes }
    })
  )
}

describe('batched node-change push (0357)', () => {
  let hub: HubInstance

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('advertises batch-push in the handshake', async () => {
    const { ws, handshake } = await connect(PORT)
    expect(handshake.type).toBe('handshake')
    expect(handshake.features).toContain('batch-push')
    ws.close()
  })

  it('persists every change in a batch frame', async () => {
    const { ws } = await connect(PORT)
    const changes = Array.from({ length: 25 }, (_, index) => makeChange(index))

    publishBatch(ws, changes)
    await new Promise((resolve) => setTimeout(resolve, 500))

    const stored = await readStoredChanges(ws, ROOM)
    for (const change of changes) {
      expect(stored.some((entry) => entry.hash === change.hash)).toBe(true)
    }
    ws.close()
  })

  it('fans out to subscribers as individual node-change messages', async () => {
    const room = 'workspace-batch-fanout'
    const { ws: publisher } = await connect(PORT)
    const { ws: subscriber } = await connect(PORT)

    subscriber.send(JSON.stringify({ type: 'subscribe', topics: [room] }))
    await new Promise((resolve) => setTimeout(resolve, 100))

    const collected = collectMessages(subscriber, 600)
    const changes = [makeChange(100), makeChange(101), makeChange(102)].map((change) => ({
      ...change,
      room
    }))
    publishBatch(publisher, changes, room)

    const messages = await collected
    const relayed = messages.filter(
      (message) =>
        message.type === 'publish' &&
        (message.data as { type?: string } | undefined)?.type === 'node-change'
    )

    // Three changes in ONE frame must arrive as THREE ordinary node-change
    // messages — a batch-unaware subscriber sees exactly what it expects.
    expect(relayed).toHaveLength(3)
    const relayedHashes = relayed.map(
      (message) => (message.data as { change: SerializedNodeChange }).change.hash
    )
    expect(relayedHashes.sort()).toEqual(changes.map((change) => change.hash).sort())
    // And no raw batch frame is ever broadcast.
    expect(
      messages.some(
        (message) => (message.data as { type?: string } | undefined)?.type === 'node-change-batch'
      )
    ).toBe(false)

    publisher.close()
    subscriber.close()
  })

  it('rejects only the invalid change and still stores the rest', async () => {
    const room = 'workspace-batch-partial'
    const { ws } = await connect(PORT)

    const good1 = { ...makeChange(200), room }
    const bad = { ...makeChange(201, { corruptSignature: true }), room }
    const good2 = { ...makeChange(202), room }

    const collected = collectMessages(ws, 600)
    publishBatch(ws, [good1, bad, good2], room)
    const messages = await collected

    const errors = messages.filter((message) => message.type === 'node-error')
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('INVALID_SIGNATURE')
    // The error names the offending change so the client can retry precisely.
    expect(errors[0].hash).toBe(bad.hash)

    const stored = await readStoredChanges(ws, room)
    const storedHashes = stored.map((entry) => entry.hash)
    expect(storedHashes).toContain(good1.hash)
    expect(storedHashes).toContain(good2.hash)
    expect(storedHashes).not.toContain(bad.hash)

    ws.close()
  })

  it('is idempotent across redelivery of the same batch', async () => {
    const room = 'workspace-batch-idempotent'
    const { ws } = await connect(PORT)
    const changes = [makeChange(300), makeChange(301)].map((change) => ({ ...change, room }))

    publishBatch(ws, changes, room)
    publishBatch(ws, changes, room)
    publishBatch(ws, changes, room)
    await new Promise((resolve) => setTimeout(resolve, 500))

    const stored = await readStoredChanges(ws, room)
    expect(stored).toHaveLength(2)
    ws.close()
  })

  it('does not store an over-large batch frame', async () => {
    const room = 'workspace-batch-oversize'
    const { ws } = await connect(PORT)

    // 1001 changes exceeds MAX_BATCH_CHANGES, so the batch guard never
    // matches and nothing is relayed. (It also exceeds no size limit — the
    // point is that the cap is enforced by shape, not by luck.)
    const changes = Array.from({ length: 1001 }, (_, index) => ({
      ...makeChange(1000 + index),
      room
    }))
    publishBatch(ws, changes, room)
    await new Promise((resolve) => setTimeout(resolve, 600))

    const { ws: reader } = await connect(PORT)
    const stored = await readStoredChanges(reader, room)
    expect(stored).toHaveLength(0)

    ws.close()
    reader.close()
  })

  it('charges every change in a batch against the per-connection change budget', async () => {
    // The budget is what stops batching from becoming a rate-limit bypass:
    // one frame, but N changes charged. Default is 5000 changes/second.
    const limitedPort = 14482
    const limitedHub = await createHub({
      port: limitedPort,
      auth: false,
      storage: 'memory',
      rateLimit: { perConnectionChangeRate: 10 }
    })
    await limitedHub.start()

    try {
      const room = 'workspace-batch-budget'
      const { ws } = await connect(limitedPort)
      const collected = collectMessages(ws, 600)

      // 25 changes in one frame blows a 10-change budget.
      publishBatch(
        ws,
        Array.from({ length: 25 }, (_, index) => ({ ...makeChange(2000 + index), room })),
        room
      )
      const messages = await collected

      const rateErrors = messages.filter(
        (message) =>
          message.type === 'error' && String(message.message ?? '').includes('changes per')
      )
      expect(rateErrors.length).toBeGreaterThan(0)
      ws.close()
    } finally {
      await limitedHub.stop()
    }
  })
})
