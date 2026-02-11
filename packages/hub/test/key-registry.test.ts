import type { HubInstance } from '../src'
import { bytesToBase64, randomBytes } from '@xnet/crypto'
import { generateKeyBundle } from '@xnet/identity'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHub } from '../src'
import { createKeyRegistryProof } from '../src/services/key-registry'

describe('Key Registry API', () => {
  let hub: HubInstance
  const PORT = 14571
  const BASE = `http://localhost:${PORT}`

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('registers and resolves a DID x25519 key', async () => {
    const bundle = generateKeyBundle()
    const x25519PublicKey = randomBytes(32)
    const proof = createKeyRegistryProof(bundle.identity.did, x25519PublicKey, bundle.signingKey)

    const registerRes = await fetch(`${BASE}/keys/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: bundle.identity.did,
        x25519PublicKey: bytesToBase64(x25519PublicKey),
        proof: bytesToBase64(proof)
      })
    })

    expect(registerRes.status).toBe(200)

    const lookupRes = await fetch(`${BASE}/keys/${bundle.identity.did}/x25519`)
    expect(lookupRes.status).toBe(200)
    const keyBytes = new Uint8Array(await lookupRes.arrayBuffer())
    expect(keyBytes).toEqual(x25519PublicKey)
  })

  it('rejects registration with invalid proof', async () => {
    const bundle = generateKeyBundle()
    const x25519PublicKey = randomBytes(32)
    const invalidProof = randomBytes(64)

    const registerRes = await fetch(`${BASE}/keys/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: bundle.identity.did,
        x25519PublicKey: bytesToBase64(x25519PublicKey),
        proof: bytesToBase64(invalidProof)
      })
    })

    expect(registerRes.status).toBe(400)
    const payload = (await registerRes.json()) as { code: string }
    expect(payload.code).toBe('INVALID_PROOF')
  })

  it('batch lookups return hex-encoded keys', async () => {
    const alice = generateKeyBundle()
    const bob = generateKeyBundle()
    const aliceKey = randomBytes(32)
    const bobKey = randomBytes(32)

    await fetch(`${BASE}/keys/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: alice.identity.did,
        x25519PublicKey: bytesToBase64(aliceKey),
        proof: bytesToBase64(createKeyRegistryProof(alice.identity.did, aliceKey, alice.signingKey))
      })
    })

    await fetch(`${BASE}/keys/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: bob.identity.did,
        x25519PublicKey: bytesToBase64(bobKey),
        proof: bytesToBase64(createKeyRegistryProof(bob.identity.did, bobKey, bob.signingKey))
      })
    })

    const missingDid = 'did:key:z6MksfAu7U6Q4Y9kZ7k6zQf4Bk3vGi2hYUKw4DW6mN31nLUZ'
    const batchRes = await fetch(`${BASE}/keys/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dids: [alice.identity.did, bob.identity.did, missingDid] })
    })

    expect(batchRes.status).toBe(200)
    const payload = (await batchRes.json()) as { keys: Record<string, string> }
    expect(Object.keys(payload.keys)).toContain(alice.identity.did)
    expect(Object.keys(payload.keys)).toContain(bob.identity.did)
    expect(Object.keys(payload.keys)).not.toContain(missingDid)
    expect(payload.keys[alice.identity.did]).toHaveLength(64)
    expect(payload.keys[bob.identity.did]).toHaveLength(64)
  })
})
