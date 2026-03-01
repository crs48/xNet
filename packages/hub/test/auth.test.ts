import type { HubInstance } from '../src/index'
import { createUCAN, generateKeyBundle } from '@xnet/identity'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createHub } from '../src/index'

describe('Hub UCAN Auth', () => {
  let hub: HubInstance
  const PORT = 14445

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: true, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('rejects connections without token', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`)
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (closeCode) => resolve(closeCode))
    })
    expect(code).toBe(4401)
  })

  it('accepts connections with valid UCAN', async () => {
    const keys = generateKeyBundle()
    const token = createUCAN({
      issuer: keys.identity.did,
      issuerKey: keys.signingKey,
      audience: 'did:key:hub',
      capabilities: [{ with: '*', can: 'hub/relay' }]
    })

    const ws = new WebSocket(`ws://localhost:${PORT}`, ['xnet-sync.v1', `xnet-auth.${token}`])
    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve())
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('rejects query-token authentication attempts', async () => {
    const keys = generateKeyBundle()
    const token = createUCAN({
      issuer: keys.identity.did,
      issuerKey: keys.signingKey,
      audience: 'did:key:hub',
      capabilities: [{ with: '*', can: 'hub/relay' }]
    })

    const ws = new WebSocket(`ws://localhost:${PORT}?token=${token}`)
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (closeCode) => resolve(closeCode))
    })
    expect(code).toBe(4401)
  })

  it('anonymous mode allows all connections', async () => {
    const anonHub = await createHub({ port: PORT + 20, auth: false, storage: 'memory' })
    await anonHub.start()

    const ws = new WebSocket(`ws://localhost:${PORT + 20}`)
    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve())
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
    await anonHub.stop()
  })

  it('periodically re-auths and disconnects expired active sessions', async () => {
    const keys = generateKeyBundle()
    const token = createUCAN({
      issuer: keys.identity.did,
      issuerKey: keys.signingKey,
      audience: 'did:key:hub',
      capabilities: [{ with: 'doc-expiring-authz', can: 'hub/signal' }],
      expiration: Math.floor(Date.now() / 1000) + 2
    })

    const ws = new WebSocket(`ws://localhost:${PORT}`, ['xnet-sync.v1', `xnet-auth.${token}`])

    const waitForMessage = async <T extends { type: string }>(
      predicate: (msg: T) => boolean
    ): Promise<T> => {
      return new Promise((resolve) => {
        const onMessage = (raw: unknown) => {
          const asString =
            typeof raw === 'string' ? raw : raw instanceof Buffer ? raw.toString() : String(raw)
          const parsed = JSON.parse(asString) as T
          if (!predicate(parsed)) {
            return
          }
          ws.off('message', onMessage)
          resolve(parsed)
        }
        ws.on('message', onMessage)
      })
    }

    await waitForMessage((msg) => msg.type === 'handshake')

    const resource = 'doc-expiring-authz'
    ws.send(JSON.stringify({ type: 'subscribe', topics: [`xnet-doc-${resource}`] }))

    ws.send(JSON.stringify({ type: 'ping' }))
    await waitForMessage((msg) => msg.type === 'pong')

    const denied = await waitForMessage(
      (msg: { type: string; code?: string; action?: string; resource?: string }) =>
        msg.type === 'auth-denied' && msg.code === 'TOKEN_EXPIRED'
    )
    expect(denied.code).toBe('TOKEN_EXPIRED')
    expect(denied.action).toBe('hub/signal')
    expect(denied.resource).toBe(resource)

    const closeCode = await new Promise<number>((resolve) => {
      ws.once('close', (code) => resolve(code))
    })
    expect(closeCode).toBe(4403)
  }, 25_000)
})
