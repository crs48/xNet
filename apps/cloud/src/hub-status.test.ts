import { describe, expect, it } from 'vitest'
import { composeDashboardLive, fetchHubHealth, type HubHealth } from './hub-status'
import type { TenantSli } from './observability/health'

const sli = (availability: number): TenantSli => ({
  tenantId: 't',
  plan: 'personal',
  sloLabel: '99.9% uptime',
  availability,
  errorRate: 1 - availability,
  p95LatencyMs: 40,
  budgetRemaining: 0.5,
  policy: 'ship',
  sampleCount: 100
})

const HEALTH: HubHealth = {
  status: 'ok',
  uptime: 1234,
  version: 'xnet-hub@1.0.0',
  region: 'us-central1',
  rooms: 2,
  docs: { hot: 3, warm: 1, total: 4 },
  connections: { active: 5, max: 250 },
  memory: { rss: 100_000_000, heapUsed: 20_000_000 }
}

describe('composeDashboardLive', () => {
  it('maps a healthy hub + SLI + AI spend into the live payload', () => {
    const out = composeDashboardLive({
      health: HEALTH,
      sli: sli(0.9994),
      aiUsedUsd: 1.23,
      dataTier: 'hot'
    })
    expect(out).toMatchObject({
      reachable: true,
      state: 'active',
      uptimeSec: 1234,
      version: 'xnet-hub@1.0.0',
      region: 'us-central1',
      connections: { active: 5, max: 250 },
      rooms: 2,
      docs: { hot: 3, warm: 1, total: 4 },
      uptimePct: 99.94,
      aiUsedUsd: 1.23
    })
  })

  it('reports sleeping when the hub is unreachable (no health)', () => {
    const out = composeDashboardLive({ health: null, sli: null, aiUsedUsd: null, dataTier: 'cold' })
    expect(out.reachable).toBe(false)
    expect(out.state).toBe('sleeping')
    expect(out.connections).toBeNull()
    expect(out.uptimePct).toBeNull()
  })

  it('reports suspended for a canceled subscription regardless of reachability', () => {
    const out = composeDashboardLive({
      health: HEALTH,
      sli: null,
      aiUsedUsd: null,
      subscriptionStatus: 'canceled',
      dataTier: 'hot'
    })
    expect(out.state).toBe('suspended')
  })

  it('tolerates a partial /health payload (missing fields → null, not crash)', () => {
    const out = composeDashboardLive({
      health: { status: 'ok' },
      sli: null,
      aiUsedUsd: null,
      dataTier: 'hot'
    })
    expect(out.reachable).toBe(true)
    expect(out.connections).toBeNull()
    expect(out.docs).toBeNull()
    expect(out.uptimeSec).toBeNull()
  })
})

describe('fetchHubHealth', () => {
  it('returns parsed JSON on a 200', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify(HEALTH), { status: 200 })) as unknown as typeof fetch
    expect(await fetchHubHealth('https://hub.example', { fetchImpl })).toMatchObject({
      status: 'ok',
      connections: { active: 5 }
    })
  })

  it('returns null on a non-200', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch
    expect(await fetchHubHealth('https://hub.example', { fetchImpl })).toBeNull()
  })

  it('returns null (never throws) when fetch rejects / aborts', async () => {
    const fetchImpl = (async () => {
      throw new Error('aborted')
    }) as unknown as typeof fetch
    expect(await fetchHubHealth('https://hub.example', { fetchImpl })).toBeNull()
  })

  it('returns null for an empty hub url', async () => {
    expect(await fetchHubHealth('')).toBeNull()
  })

  it('strips a trailing slash before appending /health', async () => {
    let seen = ''
    const fetchImpl = (async (url: string) => {
      seen = url
      return new Response(JSON.stringify(HEALTH), { status: 200 })
    }) as unknown as typeof fetch
    await fetchHubHealth('https://hub.example/', { fetchImpl })
    expect(seen).toBe('https://hub.example/health')
  })
})
