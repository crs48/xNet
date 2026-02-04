import type { HubInstance } from '../src/index'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createUCAN, generateKeyBundle } from '@xnet/identity'
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

    const ws = new WebSocket(`ws://localhost:${PORT}?token=${token}`)
    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve())
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('anonymous mode allows all connections', async () => {
    const anonHub = await createHub({ port: PORT + 1, auth: false, storage: 'memory' })
    await anonHub.start()

    const ws = new WebSocket(`ws://localhost:${PORT + 1}`)
    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve())
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
    await anonHub.stop()
  })
})
