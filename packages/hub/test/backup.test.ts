import type { HubInstance } from '../src/index'
import {
  bytesToBase64,
  createDIDFromEd25519PublicKey,
  generateSigningKeyPair,
  randomBytes,
  sign
} from '@xnet/crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHub } from '../src/index'

describe('Backup API', () => {
  let hub: HubInstance
  const PORT = 14447
  const BASE = `http://localhost:${PORT}`

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('stores and retrieves a backup blob', async () => {
    const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03])

    const putRes = await fetch(`${BASE}/backup/doc-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data
    })
    expect(putRes.status).toBe(201)
    const { key, sizeBytes } = (await putRes.json()) as { key: string; sizeBytes: number }
    expect(key).toBeTruthy()
    expect(sizeBytes).toBe(7)

    const getRes = await fetch(`${BASE}/backup/doc-1`)
    expect(getRes.status).toBe(200)
    const blob = new Uint8Array(await getRes.arrayBuffer())
    expect(blob).toEqual(data)
  })

  it('lists backups for a user', async () => {
    await fetch(`${BASE}/backup/doc-a`, {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3])
    })
    await fetch(`${BASE}/backup/doc-b`, {
      method: 'PUT',
      body: new Uint8Array([4, 5, 6])
    })

    const listRes = await fetch(`${BASE}/backup`)
    expect(listRes.status).toBe(200)
    const payload = (await listRes.json()) as { backups: unknown[]; usage: { count: number } }
    expect(payload.backups.length).toBeGreaterThanOrEqual(2)
    expect(payload.usage.count).toBeGreaterThanOrEqual(2)
  })

  it('returns 404 for missing backup', async () => {
    const res = await fetch(`${BASE}/backup/nonexistent-doc`)
    expect(res.status).toBe(404)
  })

  it('deletes a backup', async () => {
    await fetch(`${BASE}/backup/doc-del`, {
      method: 'PUT',
      body: new Uint8Array([99])
    })

    const delRes = await fetch(`${BASE}/backup/doc-del`, { method: 'DELETE' })
    expect(delRes.status).toBe(204)

    const getRes = await fetch(`${BASE}/backup/doc-del`)
    expect(getRes.status).toBe(404)
  })

  it('stores, retrieves, and protects key backups with ownership proof', async () => {
    const signer = generateSigningKeyPair()
    const did = createDIDFromEd25519PublicKey(signer.publicKey)
    const encodedDid = encodeURIComponent(did)

    const ownershipMessage = new TextEncoder().encode(`xnet-backup:${did}`)
    const proof = bytesToBase64(sign(ownershipMessage, signer.privateKey))
    const payload = {
      did,
      encryptedPayload: bytesToBase64(randomBytes(64)),
      nonce: bytesToBase64(randomBytes(24)),
      version: 1,
      createdAt: Date.now(),
      ownershipProof: proof
    }

    const postRes = await fetch(`${BASE}/backup/${encodedDid}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    expect(postRes.status).toBe(201)

    const getRes = await fetch(`${BASE}/backup/${encodedDid}`)
    expect(getRes.status).toBe(200)
    const fetched = (await getRes.json()) as typeof payload
    expect(fetched.did).toBe(did)
    expect(fetched.encryptedPayload).toBe(payload.encryptedPayload)
    expect(fetched.nonce).toBe(payload.nonce)
    expect(fetched.ownershipProof).toBe(proof)

    const wrongProof = bytesToBase64(randomBytes(64))
    const deleteDenied = await fetch(`${BASE}/backup/${encodedDid}`, {
      method: 'DELETE',
      headers: { 'x-backup-proof': wrongProof }
    })
    expect(deleteDenied.status).toBe(403)

    const deleteOk = await fetch(`${BASE}/backup/${encodedDid}`, {
      method: 'DELETE',
      headers: { 'x-backup-proof': proof }
    })
    expect(deleteOk.status).toBe(204)

    const getAfterDelete = await fetch(`${BASE}/backup/${encodedDid}`)
    expect(getAfterDelete.status).toBe(404)
  })
})
