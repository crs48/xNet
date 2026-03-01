import type { HubInstance } from '../src/index'
import { createUCAN, generateKeyBundle } from '@xnet/identity'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHub } from '../src/index'

describe('Share Handle Routes', () => {
  let hub: HubInstance
  const PORT = 14447
  let ownerToken = ''

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: true, storage: 'memory' })
    await hub.start()

    const keys = generateKeyBundle()
    ownerToken = createUCAN({
      issuer: keys.identity.did,
      issuerKey: keys.signingKey,
      audience: 'did:key:hub',
      capabilities: [{ with: '*', can: 'hub/*' }]
    })
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('issues and redeems one-time share handles', async () => {
    const issueResponse = await fetch(`http://localhost:${PORT}/shares/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        endpoint: `wss://localhost:${PORT}`,
        token: 'ucan-token-value',
        resource: 'doc-123',
        docType: 'page',
        exp: Date.now() + 60_000
      })
    })
    expect(issueResponse.status).toBe(200)
    const issued = (await issueResponse.json()) as { handle: string }
    expect(issued.handle.startsWith('sh_')).toBe(true)

    const redeemResponse = await fetch(`http://localhost:${PORT}/shares/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: issued.handle })
    })
    expect(redeemResponse.status).toBe(200)
    const redeemed = (await redeemResponse.json()) as {
      token: string
      resource: string
      docType: string
    }
    expect(redeemed.token).toBe('ucan-token-value')
    expect(redeemed.resource).toBe('doc-123')
    expect(redeemed.docType).toBe('page')

    const replayResponse = await fetch(`http://localhost:${PORT}/shares/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: issued.handle })
    })
    expect(replayResponse.status).toBe(409)
  })
})
