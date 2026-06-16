import { createUCAN, generateKeyBundle } from '@xnetjs/identity'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHub, type HubInstance } from '../src'

const tokenWith = (did: string, signingKey: Uint8Array, can: string): string =>
  createUCAN({
    issuer: did,
    issuerKey: signingKey,
    audience: 'did:key:hub',
    capabilities: [{ with: '*', can }]
  })

const batch = (records: Array<Record<string, unknown>>) => ({
  batchId: 'batch_test_1',
  timestamp: Date.now(),
  records
})

describe('Telemetry ingest + analytics API', () => {
  let hub: HubInstance
  const PORT = 14488
  const BASE = `http://localhost:${PORT}`

  const user = generateKeyBundle()
  const userToken = tokenWith(user.identity.did, user.signingKey, 'hub/relay')

  const admin = generateKeyBundle()
  const adminToken = tokenWith(admin.identity.did, admin.signingKey, 'hub/admin')

  beforeAll(async () => {
    hub = await createHub({
      port: PORT,
      auth: true,
      storage: 'memory',
      telemetryPeerHashSalt: 'test-salt'
    })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('ingests a client batch and reports it back in the summary', async () => {
    const res = await fetch(`${BASE}/telemetry/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${userToken}` },
      body: JSON.stringify(
        batch([
          {
            schemaId: 'xnet://xnet.fyi/telemetry/UsageMetric',
            data: { metricName: 'editor.save', metricBucket: '1-5' },
            createdAt: Date.now()
          },
          {
            schemaId: 'xnet://xnet.fyi/telemetry/PerformanceMetric',
            data: { metricName: 'app.startup', durationBucket: '200-1000ms' },
            createdAt: Date.now()
          }
        ])
      )
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { accepted: boolean; processed: number }
    expect(body.accepted).toBe(true)
    expect(body.processed).toBe(2)

    const summaryRes = await fetch(`${BASE}/telemetry/summary`, {
      headers: { authorization: `Bearer ${adminToken}` }
    })
    expect(summaryRes.status).toBe(200)
    const summary = (await summaryRes.json()) as {
      total: number
      kinds: Array<{ kind: string; count: number }>
      topNames: Array<{ name: string; count: number }>
    }
    expect(summary.total).toBeGreaterThanOrEqual(2)
    expect(summary.kinds.find((k) => k.kind === 'usage')?.count).toBeGreaterThanOrEqual(1)
    expect(summary.topNames.some((n) => n.name === 'editor.save')).toBe(true)
  })

  it('rejects an invalid batch body', async () => {
    const res = await fetch(`${BASE}/telemetry/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ not: 'a batch' })
    })
    expect(res.status).toBe(400)
  })

  it('requires authentication to ingest', async () => {
    const res = await fetch(`${BASE}/telemetry/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch([]))
    })
    expect(res.status).toBe(401)
  })

  it('hashes the sender DID — raw DID never reaches the store', async () => {
    await fetch(`${BASE}/telemetry/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${userToken}` },
      body: JSON.stringify(
        batch([
          {
            schemaId: 'xnet://xnet.fyi/telemetry/UsageMetric',
            data: { metricName: 'view.opened', metricBucket: 'none' },
            createdAt: Date.now()
          }
        ])
      )
    })

    const eventsRes = await fetch(`${BASE}/telemetry/events?kind=usage`, {
      headers: { authorization: `Bearer ${adminToken}` }
    })
    const { events } = (await eventsRes.json()) as {
      events: Array<{ didHash: string | null }>
    }
    expect(events.length).toBeGreaterThan(0)
    for (const e of events) {
      if (e.didHash !== null) {
        expect(e.didHash).not.toContain(user.identity.did)
        expect(e.didHash).not.toContain('did:key')
      }
    }
  })

  it('forbids non-admin reads of the analytics surface', async () => {
    const res = await fetch(`${BASE}/telemetry/summary`, {
      headers: { authorization: `Bearer ${userToken}` }
    })
    expect(res.status).toBe(403)
  })
})
