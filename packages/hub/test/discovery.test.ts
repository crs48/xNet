import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHub, type HubInstance } from '../src'

describe('Peer Discovery', () => {
  let hub: HubInstance
  const PORT = 14455
  const BASE = `http://localhost:${PORT}`

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('registers and resolves a peer', async () => {
    const regRes = await fetch(`${BASE}/dids/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: 'did:key:z6MkTestPeer1',
        publicKeyB64: 'dGVzdC1rZXk=',
        displayName: 'Test Peer 1',
        endpoints: [{ type: 'websocket', address: 'wss://peer1.example.com', priority: 0 }]
      })
    })
    expect(regRes.status).toBe(200)
    const record = await regRes.json()
    expect(record.did).toBe('did:key:z6MkTestPeer1')
    expect(record.version).toBe(1)

    const getRes = await fetch(`${BASE}/dids/did:key:z6MkTestPeer1`)
    expect(getRes.status).toBe(200)
    const resolved = await getRes.json()
    expect(resolved.displayName).toBe('Test Peer 1')
    expect(resolved.endpoints[0].address).toBe('wss://peer1.example.com')
  })

  it('updates on re-register (version increments)', async () => {
    await fetch(`${BASE}/dids/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: 'did:key:z6MkTestPeer2',
        publicKeyB64: 'a2V5Mg==',
        endpoints: [{ type: 'websocket', address: 'ws://old', priority: 0 }]
      })
    })

    const res2 = await fetch(`${BASE}/dids/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: 'did:key:z6MkTestPeer2',
        publicKeyB64: 'a2V5Mg==',
        endpoints: [{ type: 'websocket', address: 'ws://new', priority: 0 }]
      })
    })
    const record = await res2.json()
    expect(record.version).toBe(2)
    expect(record.endpoints[0].address).toBe('ws://new')
  })

  it('returns 404 for unknown DID', async () => {
    const res = await fetch(`${BASE}/dids/did:key:z6MkNonexistent`)
    expect(res.status).toBe(404)
  })

  it('lists recent peers', async () => {
    const res = await fetch(`${BASE}/dids`)
    expect(res.status).toBe(200)
    const { peers, stats } = await res.json()
    expect(peers.length).toBeGreaterThanOrEqual(1)
    expect(stats.totalPeers).toBeGreaterThanOrEqual(1)
  })

  it('supports multiple endpoint types', async () => {
    await fetch(`${BASE}/dids/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: 'did:key:z6MkMultiEndpoint',
        publicKeyB64: 'bXVsdGk=',
        endpoints: [
          { type: 'websocket', address: 'wss://hub.example.com', priority: 0 },
          { type: 'webrtc-signaling', address: 'wss://signal.example.com', priority: 1 },
          { type: 'libp2p', address: '/dns4/example.com/tcp/4001/p2p/QmXyz', priority: 2 }
        ]
      })
    })

    const res = await fetch(`${BASE}/dids/did:key:z6MkMultiEndpoint`)
    const record = await res.json()
    expect(record.endpoints.length).toBe(3)
    expect(record.endpoints[0].type).toBe('websocket')
  })
})
