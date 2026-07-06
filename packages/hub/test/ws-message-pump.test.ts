/**
 * @xnetjs/hub - WebSocket message-pump tests (exploration 0276 Theme 2).
 *
 * The pump was decomposed into src/ws/ (router + handlers); these tests pin
 * the wire behavior the old inline pump had: handshake/version negotiation,
 * unknown-type tolerance, query dispatch, sync-request authorization, and the
 * exact error-response shapes clients parse.
 */

import { createUCAN, generateKeyBundle } from '@xnetjs/identity'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createHub, type HubInstance } from '../src'

const PORT = 14476
const AUTH_PORT = 14576

const connectAndWaitHandshake = (port: number, protocols?: string[]): Promise<WebSocket> =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`, protocols)
    ws.on('open', () => {
      // Consume the hub handshake before resolving
      ws.once('message', () => resolve(ws))
    })
  })

const waitForMessage = (ws: WebSocket): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 2000)
    ws.once('message', (data) => {
      clearTimeout(timeout)
      resolve(JSON.parse(data.toString()) as Record<string, unknown>)
    })
  })

const expectNoMessage = (ws: WebSocket, ms: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const onMessage = (data: import('ws').RawData): void => {
      clearTimeout(timer)
      reject(new Error(`unexpected message: ${data.toString()}`))
    }
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      resolve()
    }, ms)
    ws.once('message', onMessage)
  })

describe('WS message pump (no auth)', () => {
  let hub: HubInstance

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('sends the hub handshake as the first message on connect', async () => {
    const msg = await new Promise<Record<string, unknown>>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`)
      ws.once('message', (data) => {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>)
        ws.close()
      })
    })

    expect(msg.type).toBe('handshake')
    expect(msg.protocolVersion).toBe(1)
    expect(msg.minProtocolVersion).toBe(1)
    expect(msg.features).toContain('node-changes')
  })

  it('ignores unknown message types and keeps the connection alive', async () => {
    const ws = await connectAndWaitHandshake(PORT)

    ws.send(JSON.stringify({ type: 'totally-bogus', anything: true }))
    await expectNoMessage(ws, 100)

    // The connection still works afterwards.
    ws.send(JSON.stringify({ type: 'ping' }))
    const pong = await waitForMessage(ws)
    expect(pong.type).toBe('pong')
    ws.close()
  })

  it('counts messages by type (unknown types bucket to `unknown`)', async () => {
    const res = await fetch(`http://localhost:${PORT}/metrics`)
    const body = await res.text()
    expect(body).toContain('hub_ws_messages_received_total')
    expect(body).toContain('hub_ws_messages_received_unknown_total')
  })

  it('accepts a compatible client-handshake without replying', async () => {
    const ws = await connectAndWaitHandshake(PORT)

    ws.send(
      JSON.stringify({
        type: 'client-handshake',
        did: 'did:key:test-client',
        protocolVersion: 1,
        minProtocolVersion: 1,
        features: [],
        packageVersion: '0.0.1'
      })
    )
    await expectNoMessage(ws, 100)
    ws.close()
  })

  it('answers an incompatible client-handshake with version-mismatch (and stays open)', async () => {
    const ws = await connectAndWaitHandshake(PORT)

    ws.send(
      JSON.stringify({
        type: 'client-handshake',
        did: 'did:key:test-client',
        protocolVersion: 0,
        minProtocolVersion: 0,
        features: [],
        packageVersion: '0.0.1'
      })
    )

    const msg = await waitForMessage(ws)
    expect(msg).toMatchObject({
      type: 'version-mismatch',
      hubVersion: 1,
      clientVersion: 0,
      suggestion: 'upgrade-client'
    })
    expect(typeof msg.message).toBe('string')

    // The mismatch only warns; the connection is not closed.
    ws.send(JSON.stringify({ type: 'ping' }))
    const pong = await waitForMessage(ws)
    expect(pong.type).toBe('pong')
    ws.close()
  })

  it('suggests upgrade-hub when the client requires a newer protocol', async () => {
    const ws = await connectAndWaitHandshake(PORT)

    ws.send(
      JSON.stringify({
        type: 'client-handshake',
        did: 'did:key:test-client',
        protocolVersion: 5,
        minProtocolVersion: 5,
        features: [],
        packageVersion: '0.0.1'
      })
    )

    const msg = await waitForMessage(ws)
    expect(msg).toMatchObject({
      type: 'version-mismatch',
      hubVersion: 1,
      clientVersion: 5,
      suggestion: 'upgrade-hub'
    })
    ws.close()
  })

  it('dispatches query-request through the index round-trip', async () => {
    const ws = await connectAndWaitHandshake(PORT)

    ws.send(
      JSON.stringify({
        type: 'index-update',
        docId: 'doc-pump-1',
        meta: { schemaIri: 'xnet://xnet.dev/Page', title: 'Pump Alpha' },
        text: 'alpha pump content'
      })
    )
    const ack = await waitForMessage(ws)
    expect(ack).toMatchObject({ type: 'index-ack', docId: 'doc-pump-1', indexed: true })

    ws.send(JSON.stringify({ type: 'query-request', id: 'q-pump-1', query: 'alpha' }))
    const response = (await waitForMessage(ws)) as {
      type: string
      id: string
      results?: Array<{ docId: string }>
    }
    expect(response.type).toBe('query-response')
    expect(response.id).toBe('q-pump-1')
    expect(response.results?.map((r) => r.docId)).toContain('doc-pump-1')
    ws.close()
  })
})

describe('WS message pump (auth)', () => {
  let hub: HubInstance
  const ROOM = 'workspace-pump-auth'

  const createToken = (capabilities: Array<{ with: string; can: string }>): string => {
    const keys = generateKeyBundle()
    return createUCAN({
      issuer: keys.identity.did,
      issuerKey: keys.signingKey,
      audience: 'did:key:hub',
      capabilities
    })
  }

  const connectWithToken = (token: string): Promise<WebSocket> =>
    connectAndWaitHandshake(AUTH_PORT, ['xnet-sync.v1', `xnet-auth.${token}`])

  beforeAll(async () => {
    hub = await createHub({ port: AUTH_PORT, auth: true, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('serves node-sync-request for an authorized room capability', async () => {
    const ws = await connectWithToken(createToken([{ with: ROOM, can: 'hub/relay' }]))

    ws.send(JSON.stringify({ type: 'node-sync-request', room: ROOM, sinceLamport: 0 }))
    const response = await waitForMessage(ws)

    expect(response.type).toBe('node-sync-response')
    expect(response.changes).toEqual([])
    ws.close()
  })

  it('denies node-sync-request without room capability, preserving the node-error shape', async () => {
    const ws = await connectWithToken(createToken([{ with: '*', can: 'hub/query' }]))

    ws.send(JSON.stringify({ type: 'node-sync-request', room: ROOM, sinceLamport: 0 }))
    const error = await waitForMessage(ws)

    // Exact legacy wire shape — clients parse these fields.
    expect(error).toEqual({
      type: 'node-error',
      code: 'UNAUTHORIZED',
      error: 'Capability and grant index checks denied access',
      action: 'hub/relay',
      resource: ROOM
    })
    ws.close()
  })

  it('denies query-request without query capability, preserving the query-error shape', async () => {
    const ws = await connectWithToken(createToken([{ with: ROOM, can: 'hub/relay' }]))

    ws.send(JSON.stringify({ type: 'query-request', id: 'q-denied', query: 'alpha' }))
    const error = await waitForMessage(ws)

    // Exact legacy wire shape — useHubSearch parses these fields.
    expect(error).toEqual({
      type: 'query-error',
      id: 'q-denied',
      error: 'Capability does not allow querying',
      code: 'FORBIDDEN',
      action: 'hub/query'
    })
    ws.close()
  })

  it('denies subscribe to an unauthorized doc room with auth-denied and closes 4403', async () => {
    const ws = await connectWithToken(createToken([{ with: '*', can: 'hub/query' }]))

    const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)))
    ws.send(JSON.stringify({ type: 'subscribe', topics: ['xnet-doc-secret'] }))

    const error = await waitForMessage(ws)
    expect(error).toEqual({
      type: 'auth-denied',
      code: 'UNAUTHORIZED',
      action: 'hub/signal',
      resource: 'secret',
      error: 'Capability and grant index checks denied access'
    })
    expect(await closed).toBe(4403)
  })
})
