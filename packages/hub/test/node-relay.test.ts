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

  it('rejects invalid signatures without appending node changes', async () => {
    const room = 'workspace-invalid-signature'
    const ws = await connect(PORT)

    const change = makeSerializedChange({
      room,
      signatureB64: bytesToBase64(new Uint8Array(64).fill(0))
    })

    ws.send(
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

    const error = (await waitForMessage(ws)) as {
      type: string
      code?: string
    }

    expect(error).toMatchObject({
      type: 'node-error',
      code: 'INVALID_SIGNATURE'
    })

    ws.send(JSON.stringify({ type: 'node-sync-request', room, sinceLamport: 0 }))

    const response = (await waitForMessage(ws)) as {
      type: string
      changes?: SerializedNodeChange[]
    }

    expect(response.type).toBe('node-sync-response')
    expect(response.changes).toEqual([])

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
})
