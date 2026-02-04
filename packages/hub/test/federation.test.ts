import type { HubInstance } from '../src'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createHub } from '../src'
import { generateIdentity } from '@xnet/identity'

const connect = (port: number): Promise<WebSocket> =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`)
    ws.on('open', () => resolve(ws))
  })

const sendAndWait = (ws: WebSocket, msg: object, matchType: string): Promise<any> =>
  new Promise((resolve) => {
    const handler = (raw: Buffer) => {
      const data = JSON.parse(raw.toString()) as { type?: string }
      if (data.type === matchType) {
        ws.off('message', handler)
        resolve(data)
      }
    }
    ws.on('message', handler)
    ws.send(JSON.stringify(msg))
  })

describe('Hub Federation', () => {
  let hubA: HubInstance
  let hubB: HubInstance
  const PORT_A = 14460
  const PORT_B = 14461

  beforeAll(async () => {
    const identityA = generateIdentity()
    const identityB = generateIdentity()

    hubA = await createHub({
      port: PORT_A,
      auth: false,
      storage: 'memory',
      federation: {
        enabled: true,
        hubDid: identityA.identity.did,
        hubSigningKey: identityA.privateKey,
        peers: [
          {
            url: `http://localhost:${PORT_B}`,
            hubDid: identityB.identity.did,
            schemas: '*',
            trustLevel: 'full',
            maxLatencyMs: 2000,
            rateLimit: 60,
            healthy: true,
            lastSuccessAt: null
          }
        ],
        expose: { schemas: '*', requireAuth: false, rateLimit: 60, maxResults: 50 },
        peerTimeoutMs: 2000,
        totalTimeoutMs: 5000
      }
    })

    hubB = await createHub({
      port: PORT_B,
      auth: false,
      storage: 'memory',
      federation: {
        enabled: true,
        hubDid: identityB.identity.did,
        hubSigningKey: identityB.privateKey,
        peers: [],
        expose: { schemas: '*', requireAuth: false, rateLimit: 60, maxResults: 50 },
        peerTimeoutMs: 2000,
        totalTimeoutMs: 5000
      }
    })

    await hubA.start()
    await hubB.start()
  })

  afterAll(async () => {
    await hubA.stop()
    await hubB.stop()
  })

  it('federates query results across hubs', async () => {
    const wsA = await connect(PORT_A)
    const wsB = await connect(PORT_B)

    await sendAndWait(
      wsB,
      {
        type: 'index-update',
        docId: 'federation-doc-b',
        meta: { schemaIri: 'xnet://xnet.dev/Page', title: 'Federated Hub Doc' },
        text: 'This document lives on hub B and should be federated.'
      },
      'index-ack'
    )

    await sendAndWait(
      wsA,
      {
        type: 'index-update',
        docId: 'federation-doc-a',
        meta: { schemaIri: 'xnet://xnet.dev/Page', title: 'Local Hub Doc' },
        text: 'This document lives on hub A.'
      },
      'index-ack'
    )

    const response = await sendAndWait(
      wsA,
      {
        type: 'query-request',
        id: 'q-fed',
        query: 'document',
        federate: true
      },
      'query-response'
    )

    const docIds = response.results.map((r: { docId: string }) => r.docId)
    expect(docIds).toContain('federation-doc-b')
    expect(docIds).toContain('federation-doc-a')

    wsA.close()
    wsB.close()
  })

  it('deduplicates results by CID', async () => {
    const wsA = await connect(PORT_A)
    const wsB = await connect(PORT_B)

    await sendAndWait(
      wsA,
      {
        type: 'index-update',
        docId: 'dedupe-doc',
        meta: { schemaIri: 'xnet://xnet.dev/Page', title: 'Dedupe Doc' },
        text: 'Same document on both hubs.'
      },
      'index-ack'
    )

    await sendAndWait(
      wsB,
      {
        type: 'index-update',
        docId: 'dedupe-doc',
        meta: { schemaIri: 'xnet://xnet.dev/Page', title: 'Dedupe Doc' },
        text: 'Same document on both hubs.'
      },
      'index-ack'
    )

    const response = await sendAndWait(
      wsA,
      {
        type: 'query-request',
        id: 'q-dedupe',
        query: 'Dedupe',
        federate: true
      },
      'query-response'
    )

    const matches = response.results.filter((r: { docId: string }) => r.docId === 'dedupe-doc')
    expect(matches.length).toBe(1)

    wsA.close()
    wsB.close()
  })

  it('respects schema filters for federation routing', async () => {
    const wsA = await connect(PORT_A)

    const response = await sendAndWait(
      wsA,
      {
        type: 'query-request',
        id: 'q-schema',
        query: 'document',
        filters: { schemaIri: 'xnet://xnet.dev/Task' },
        federate: true
      },
      'query-response'
    )

    expect(Array.isArray(response.results)).toBe(true)
    wsA.close()
  })

  it('exposes federation status endpoint', async () => {
    const response = await fetch(`http://localhost:${PORT_A}/federation/status`)
    expect(response.status).toBe(200)
    const status = await response.json()
    expect(status.federation).toBe(true)
    expect(status.peerCount).toBeGreaterThanOrEqual(1)
  })
})
