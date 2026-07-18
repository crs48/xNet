import type { SerializedNodeChange } from '../src/storage/interface'
import type { DID } from '@xnetjs/core'
import { bytesToBase64, generateSigningKeyPair } from '@xnetjs/crypto'
import { createUCAN, generateKeyBundle, identityFromPrivateKey } from '@xnetjs/identity'
import { createUnsignedChange, signChange, createChangeId } from '@xnetjs/sync'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { WebSocket } from 'ws'
import { createHub, type HubInstance } from '../src'

const PORT = 14461
const AUTH_PORT = 14561
const ROOM = 'workspace-test-1'
const SYSTEM_NODE_ID = 'xnet://did:key:z6MkSystemAuthority/sys/schema/remote-note'
const SYSTEM_SCHEMA_IRI = 'xnet://xnet.fyi/SchemaDefinition@1.0.0'

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

const connectWithToken = (port: number, token: string): Promise<WebSocket> =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`, ['xnet-sync.v1', `xnet-auth.${token}`])
    ws.on('open', () => {
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
  const payload = overrides.payload ?? {
    nodeId: 'node-1',
    schemaId: 'xnet://xnet.dev/Task',
    properties: { title: 'Test Task', status: 'todo' }
  }
  const unsigned = createUnsignedChange({
    id: createChangeId(),
    type: 'node-change',
    payload,
    parentHash: null,
    authorDID: identity.did as DID,
    wallTime: Date.now(),
    lamport: 1
  })

  const signed = signChange(unsigned, privateKey)

  return {
    id: signed.id,
    type: signed.type,
    hash: signed.hash,
    room: overrides.room ?? ROOM,
    nodeId: payload.nodeId,
    schemaId: payload.schemaId,
    lamportTime: signed.lamport,
    lamportAuthor: signed.authorDID,
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

const makeSerializedSystemChange = (
  overrides: Partial<SerializedNodeChange> = {}
): SerializedNodeChange =>
  makeSerializedChange({
    nodeId: SYSTEM_NODE_ID,
    schemaId: SYSTEM_SCHEMA_IRI,
    payload: {
      nodeId: SYSTEM_NODE_ID,
      schemaId: SYSTEM_SCHEMA_IRI,
      properties: {
        schemaIri: 'xnet://xnet.dev/RemoteNote@1.0.0',
        version: '1.0.0'
      }
    },
    ...overrides
  })

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

  it('node-clear wipes a room and returns the count, then sync is empty', async () => {
    const room = 'workspace-clear-1'
    const ws = await connect(PORT)

    const change = makeSerializedChange({ room })
    ws.send(
      JSON.stringify({ type: 'publish', topic: room, data: { type: 'node-change', room, change } })
    )
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Clear the room.
    ws.send(JSON.stringify({ type: 'node-clear', room }))
    const cleared = (await waitForMessage(ws)) as { type: string; room: string; cleared: number }
    expect(cleared.type).toBe('node-cleared')
    expect(cleared.room).toBe(room)
    expect(cleared.cleared).toBe(1)

    // The room is now empty.
    ws.send(JSON.stringify({ type: 'node-sync-request', room, sinceLamport: 0 }))
    const response = (await waitForMessage(ws)) as {
      type: string
      changes?: SerializedNodeChange[]
    }
    expect(response.type).toBe('node-sync-response')
    expect(response.changes?.length).toBe(0)

    // After a clear the same change can be re-appended (dedup map was cleared).
    ws.send(
      JSON.stringify({ type: 'publish', topic: room, data: { type: 'node-change', room, change } })
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    ws.send(JSON.stringify({ type: 'node-sync-request', room, sinceLamport: 0 }))
    const reAdded = (await waitForMessage(ws)) as { type: string; changes?: SerializedNodeChange[] }
    expect(reAdded.changes?.length).toBe(1)

    ws.close()
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

  /** Publish a change, expect a node-error with the code, verify nothing appended. */
  const expectRejectedChange = async (
    room: string,
    change: SerializedNodeChange,
    code: string
  ): Promise<void> => {
    const ws = await connect(PORT)
    ws.send(
      JSON.stringify({
        type: 'publish',
        topic: room,
        data: { type: 'node-change', room, change }
      })
    )

    const error = (await waitForMessage(ws)) as { type: string; code?: string }
    expect(error).toMatchObject({ type: 'node-error', code })

    ws.send(JSON.stringify({ type: 'node-sync-request', room, sinceLamport: 0 }))
    const response = (await waitForMessage(ws)) as {
      type: string
      changes?: SerializedNodeChange[]
    }
    expect(response.type).toBe('node-sync-response')
    expect(response.changes).toEqual([])

    ws.close()
  }

  it('rejects invalid signatures without appending node changes', async () => {
    const room = 'workspace-invalid-signature'
    const change = makeSerializedChange({
      room,
      signatureB64: bytesToBase64(new Uint8Array(64).fill(0))
    })
    await expectRejectedChange(room, change, 'INVALID_SIGNATURE')
  })

  it('rejects malformed mentions declarations without appending (0168)', async () => {
    const change = makeSerializedChange({
      payload: {
        nodeId: 'msg-1',
        schemaId: 'xnet://xnet.fyi/ChatMessage@1.0.0',
        properties: {
          channel: 'chan-1',
          content: 'mention bomb',
          mentions: { dids: ['not-a-did'] }
        }
      }
    })
    await expectRejectedChange('workspace-bad-mentions', change, 'INVALID_CHANGE')
  })

  it('relays well-formed mentions declarations (0168)', async () => {
    const room = 'workspace-good-mentions'
    const ws = await connect(PORT)

    const change = makeSerializedChange({
      payload: {
        nodeId: 'msg-2',
        schemaId: 'xnet://xnet.fyi/ChatMessage@1.0.0',
        properties: {
          channel: 'chan-1',
          content: 'hey @alice',
          mentions: { dids: ['did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'] }
        }
      }
    })

    ws.send(
      JSON.stringify({
        type: 'publish',
        topic: room,
        data: { type: 'node-change', room, change }
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 50))

    ws.send(JSON.stringify({ type: 'node-sync-request', room, sinceLamport: 0 }))
    const response = (await waitForMessage(ws)) as {
      type: string
      changes?: SerializedNodeChange[]
    }
    expect(response.changes?.length).toBe(1)

    ws.close()
  })

  it('rejects invalid hashes without appending node changes', async () => {
    const room = 'workspace-invalid-hash'
    const change = makeSerializedChange({
      room,
      hash: 'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000'
    })
    await expectRejectedChange(room, change, 'INVALID_HASH')
  })

  it('reports a diagnostic hash mismatch (both hashes + protocol versions) on INVALID_HASH', async () => {
    // A hash mismatch is almost always a protocol/build skew, not corruption.
    // The error must name the client hash, the hub-recomputed hash, and both
    // protocol versions so operators fix the skew instead of chasing ghosts.
    const room = 'workspace-invalid-hash-detail'
    const sent = 'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000'
    const change = makeSerializedChange({ room, hash: sent })
    const ws = await connect(PORT)
    ws.send(
      JSON.stringify({ type: 'publish', topic: room, data: { type: 'node-change', room, change } })
    )

    const error = (await waitForMessage(ws)) as { type: string; code?: string; error?: string }
    expect(error.code).toBe('INVALID_HASH')
    expect(error.error).toContain(`client sent ${sent}`)
    expect(error.error).toContain('hub recomputed cid:blake3:')
    expect(error.error).toMatch(/hub protocol v\d+/)

    ws.close()
  })

  it('rejects duplicate system namespace changes as replay attempts', async () => {
    const room = 'workspace-system-replay'
    const ws = await connect(PORT)
    const change = makeSerializedSystemChange({ room })
    const publish = {
      type: 'publish',
      topic: room,
      data: {
        type: 'node-change',
        room,
        change
      }
    }

    ws.send(JSON.stringify(publish))
    await new Promise((resolve) => setTimeout(resolve, 50))
    ws.send(JSON.stringify(publish))

    const error = (await waitForMessage(ws)) as {
      type: string
      code?: string
      action?: string
      resource?: string
    }

    expect(error).toMatchObject({
      type: 'node-error',
      code: 'REPLAY_REJECTED',
      action: 'hub/relay',
      resource: SYSTEM_NODE_ID
    })

    ws.send(JSON.stringify({ type: 'node-sync-request', room, sinceLamport: 0 }))

    const response = (await waitForMessage(ws)) as {
      type: string
      changes?: SerializedNodeChange[]
    }

    expect(response.type).toBe('node-sync-response')
    expect(response.changes?.filter((entry) => entry.hash === change.hash)).toHaveLength(1)

    ws.close()
  })
})

describe('Node Sync Relay authorization', () => {
  let hub: HubInstance
  const telemetry = {
    reportSecurityEvent: vi.fn(),
    reportUsage: vi.fn()
  }

  const createToken = (
    capabilities: Array<{ with: string; can: string }>
  ): { token: string; did: string } => {
    const keys = generateKeyBundle()
    return {
      token: createUCAN({
        issuer: keys.identity.did,
        issuerKey: keys.signingKey,
        audience: 'did:key:hub',
        capabilities
      }),
      did: keys.identity.did
    }
  }

  beforeAll(async () => {
    hub = await createHub({
      port: AUTH_PORT,
      auth: true,
      storage: 'memory',
      telemetry,
      telemetryPeerHashSalt: 'node-relay-authz-test'
    })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('rejects unauthorized node-change publishes before append and emits telemetry', async () => {
    telemetry.reportSecurityEvent.mockClear()
    telemetry.reportUsage.mockClear()

    const room = 'workspace-unauthorized-node-change'
    const deniedToken = createToken([{ with: '*', can: 'hub/query' }])
    const allowedToken = createToken([{ with: room, can: 'hub/relay' }])
    const deniedWs = await connectWithToken(AUTH_PORT, deniedToken.token)
    const change = makeSerializedChange({ room })

    deniedWs.send(
      JSON.stringify({
        type: 'publish',
        topic: room,
        data: {
          type: 'node-change',
          room,
          change
        }
      })
    )

    const error = (await waitForMessage(deniedWs)) as {
      type: string
      code?: string
      action?: string
      resource?: string
    }

    expect(error).toMatchObject({
      type: 'node-error',
      code: 'UNAUTHORIZED',
      action: 'hub/relay',
      resource: room
    })
    expect(telemetry.reportSecurityEvent).toHaveBeenCalledTimes(1)
    const [eventName, severity, details] = telemetry.reportSecurityEvent.mock.calls[0]
    expect(eventName).toBe('xnet.security.remote_mutation_rejected')
    expect(severity).toBe('high')
    expect(details).toMatchObject({
      actionTaken: 'remote_mutation_rejected',
      primaryReason: 'failed-admission',
      reasons: ['failed-admission', 'unauthorized'],
      resourceAction: 'normal',
      shouldThrottle: false,
      surface: 'remoteMutation'
    })
    expect(details?.peerHash).toMatch(/^p_/)
    expect(JSON.stringify(details)).not.toContain(deniedToken.did)
    expect(telemetry.reportUsage).toHaveBeenCalledWith(
      'xnet.security.remote_mutation_rejections',
      1
    )

    const allowedWs = await connectWithToken(AUTH_PORT, allowedToken.token)
    allowedWs.send(JSON.stringify({ type: 'node-sync-request', room, sinceLamport: 0 }))

    const response = (await waitForMessage(allowedWs)) as {
      type: string
      changes?: SerializedNodeChange[]
    }

    expect(response.type).toBe('node-sync-response')
    expect(response.changes).toEqual([])

    deniedWs.close()
    allowedWs.close()
  })

  it('requires system namespace relay scope in addition to room scope', async () => {
    telemetry.reportSecurityEvent.mockClear()
    telemetry.reportUsage.mockClear()

    const room = 'workspace-system-scope'
    const roomOnlyToken = createToken([{ with: room, can: 'hub/relay' }])
    const allowedToken = createToken([
      { with: room, can: 'hub/relay' },
      { with: SYSTEM_NODE_ID, can: 'hub/relay' }
    ])
    const deniedWs = await connectWithToken(AUTH_PORT, roomOnlyToken.token)
    const change = makeSerializedSystemChange({ room })

    deniedWs.send(
      JSON.stringify({
        type: 'publish',
        topic: room,
        data: {
          type: 'node-change',
          room,
          change
        }
      })
    )

    const error = (await waitForMessage(deniedWs)) as {
      type: string
      code?: string
      action?: string
      resource?: string
    }

    expect(error).toMatchObject({
      type: 'node-error',
      code: 'MISSING_SCOPE',
      action: 'hub/relay',
      resource: SYSTEM_NODE_ID
    })
    expect(telemetry.reportSecurityEvent).toHaveBeenCalledTimes(1)

    const allowedWs = await connectWithToken(AUTH_PORT, allowedToken.token)
    allowedWs.send(
      JSON.stringify({
        type: 'publish',
        topic: room,
        data: {
          type: 'node-change',
          room,
          change
        }
      })
    )

    await new Promise((resolve) => setTimeout(resolve, 50))
    allowedWs.send(JSON.stringify({ type: 'node-sync-request', room, sinceLamport: 0 }))

    const response = (await waitForMessage(allowedWs)) as {
      type: string
      changes?: SerializedNodeChange[]
    }

    expect(response.type).toBe('node-sync-response')
    expect(response.changes?.map((entry) => entry.hash)).toContain(change.hash)

    deniedWs.close()
    allowedWs.close()
  })
})

describe('sync-request paging', () => {
  const auth = { did: 'did:key:zAuthor', can: () => true }

  const change = (room: string, lamport: number): SerializedNodeChange =>
    ({
      id: `c${lamport}`,
      type: 'node-change',
      hash: `h${lamport}`,
      room,
      nodeId: 'n1',
      schemaId: 'xnet://xnet.dev/Task',
      lamportTime: lamport,
      lamportAuthor: 'did:key:zAuthor',
      authorDid: 'did:key:zAuthor',
      wallTime: 1,
      parentHash: null,
      payload: { nodeId: 'n1', properties: { title: 't' } },
      signatureB64: 'AA=='
    }) as SerializedNodeChange

  // The whole point of the paged response: walking it like the client does must
  // deliver every change. A mark that ran past the page used to strand the rest
  // of the room behind a cursor that only moves forward.
  it('walks a >1-page room without skipping changes', async () => {
    const { createMemoryStorage } = await import('../src/storage/memory')
    const { NodeRelayService } = await import('../src/services/node-relay')
    const storage = createMemoryStorage()
    const relay = new NodeRelayService(storage)
    const room = 'workspace-paging'

    const TOTAL = 2500
    for (let i = 1; i <= TOTAL; i++) await storage.appendNodeChange(room, change(room, i))

    const seen: number[] = []
    let cursor = 0
    for (let page = 0; page < 20; page++) {
      const res = await relay.handleSyncRequest(
        { type: 'node-sync-request', room, sinceLamport: cursor },
        auth
      )
      for (const c of res.changes) seen.push(c.lamportTime)
      expect(res.highWaterMark).toBeGreaterThanOrEqual(cursor)
      cursor = res.highWaterMark
      if (!res.hasMore) break
    }

    expect(seen).toEqual(Array.from({ length: TOTAL }, (_, i) => i + 1))
    expect(cursor).toBe(TOTAL)
  })

  it('reports hasMore false and the room mark when everything fits in one page', async () => {
    const { createMemoryStorage } = await import('../src/storage/memory')
    const { NodeRelayService } = await import('../src/services/node-relay')
    const storage = createMemoryStorage()
    const relay = new NodeRelayService(storage)
    const room = 'workspace-small'

    await storage.appendNodeChange(room, change(room, 3))
    const res = await relay.handleSyncRequest(
      { type: 'node-sync-request', room, sinceLamport: 0 },
      auth
    )
    expect(res.changes).toHaveLength(1)
    expect(res.highWaterMark).toBe(3)
    expect(res.hasMore).toBe(false)
  })
})
