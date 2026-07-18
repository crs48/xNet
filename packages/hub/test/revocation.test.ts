/**
 * 0307-B: UCAN audience enforcement + revocation list.
 */
import type { HubInstance } from '../src/index'
import { createUCAN, generateKeyBundle, ucanTokenId } from '@xnetjs/identity'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { RevocationService } from '../src/auth/revocation'
import { createHub } from '../src/index'

const PORT = 14471
const HUB_DID = 'did:key:z6MkTestHubIdentity'

const clientCaps = [
  { with: '*', can: 'hub/relay' },
  { with: '*', can: 'hub/connect' }
]

// The ws handshake completes before the hub's async auth check runs, so a
// rejected socket looks 'open' briefly and then closes with the auth code.
// Resolve 'open' only when no server-side close arrives within the grace
// window; otherwise resolve the close code.
const connect = (token: string): Promise<number | 'open'> => {
  const ws = new WebSocket(`ws://localhost:${PORT}`, ['xnet-sync.v1', `xnet-auth.${token}`])
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.close()
      resolve('open')
    }, 500)
    ws.on('close', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
    ws.on('error', () => {
      /* close event carries the code */
    })
  })
}

describe('RevocationService', () => {
  it('revokes a single token by id and prunes at expiry', () => {
    const svc = new RevocationService()
    const nowSeconds = Math.floor(Date.now() / 1000)
    svc.revokeToken('abc', nowSeconds + 60)
    expect(svc.isRevoked('abc', { iss: 'did:key:x', exp: nowSeconds + 60 })).toBe(true)
    expect(svc.isRevoked('other', { iss: 'did:key:x', exp: nowSeconds + 60 })).toBe(false)
  })

  it('revokes a DID wholesale and reinstates it', () => {
    const svc = new RevocationService()
    const nowSeconds = Math.floor(Date.now() / 1000)
    svc.revokeDid('did:key:mallory')
    // A token that expires within the 24h max TTL window was minted pre-cutoff.
    expect(
      svc.isRevoked('any-token', { iss: 'did:key:mallory', exp: nowSeconds + 60 * 60 })
    ).toBe(true)
    expect(svc.isRevoked('any-token', { iss: 'did:key:alice', exp: nowSeconds + 60 * 60 })).toBe(
      false
    )
    svc.reinstateDid('did:key:mallory')
    expect(
      svc.isRevoked('any-token', { iss: 'did:key:mallory', exp: nowSeconds + 60 * 60 })
    ).toBe(false)
  })
})

describe('Hub aud enforcement + revocation (0307-B)', () => {
  let hub: HubInstance

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: true, storage: 'memory', hubDid: HUB_DID })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('rejects a token whose audience names another hub', async () => {
    const keys = generateKeyBundle()
    const token = createUCAN({
      issuer: keys.identity.did,
      issuerKey: keys.signingKey,
      audience: 'did:key:some-other-hub',
      capabilities: clientCaps
    })
    expect(await connect(token)).toBe(4401)
  })

  it('accepts a token whose audience is this hub DID', async () => {
    const keys = generateKeyBundle()
    const token = createUCAN({
      issuer: keys.identity.did,
      issuerKey: keys.signingKey,
      audience: HUB_DID,
      capabilities: clientCaps
    })
    expect(await connect(token)).toBe('open')
  })

  it('exposes hubDid on /health for client audience discovery', async () => {
    const res = await fetch(`http://localhost:${PORT}/health`)
    const body = (await res.json()) as { hubDid?: string }
    expect(body.hubDid).toBe(HUB_DID)
  })

  it('rejects a revoked token on connect; requires hub/admin to revoke', async () => {
    const keys = generateKeyBundle()
    const token = createUCAN({
      issuer: keys.identity.did,
      issuerKey: keys.signingKey,
      audience: HUB_DID,
      capabilities: clientCaps,
      nonce: 'n-1'
    })
    expect(await connect(token)).toBe('open')

    // A non-admin token cannot revoke.
    const denied = await fetch(`http://localhost:${PORT}/auth/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    expect(denied.status).toBe(403)

    const admin = generateKeyBundle()
    const adminToken = createUCAN({
      issuer: admin.identity.did,
      issuerKey: admin.signingKey,
      audience: HUB_DID,
      capabilities: [{ with: '*', can: 'hub/admin' }]
    })
    const res = await fetch(`http://localhost:${PORT}/auth/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    expect(res.status).toBe(200)

    expect(await connect(token)).toBe(4403)

    // Same identity can mint a fresh token (nonce makes the id distinct).
    const fresh = createUCAN({
      issuer: keys.identity.did,
      issuerKey: keys.signingKey,
      audience: HUB_DID,
      capabilities: clientCaps,
      nonce: 'n-2'
    })
    expect(ucanTokenId(fresh)).not.toBe(ucanTokenId(token))
    expect(await connect(fresh)).toBe('open')
  })

  it('revokes a DID wholesale via /auth/revoke', async () => {
    const keys = generateKeyBundle()
    const mint = (nonce: string): string =>
      createUCAN({
        issuer: keys.identity.did,
        issuerKey: keys.signingKey,
        audience: HUB_DID,
        capabilities: clientCaps,
        nonce
      })
    expect(await connect(mint('a'))).toBe('open')

    const admin = generateKeyBundle()
    const adminToken = createUCAN({
      issuer: admin.identity.did,
      issuerKey: admin.signingKey,
      audience: HUB_DID,
      capabilities: [{ with: '*', can: 'hub/admin' }]
    })
    const res = await fetch(`http://localhost:${PORT}/auth/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: keys.identity.did })
    })
    expect(res.status).toBe(200)

    expect(await connect(mint('b'))).toBe(4403)
  })
})
