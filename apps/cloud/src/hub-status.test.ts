import type { TenantSli } from './observability/health'
import { describe, expect, it } from 'vitest'
import {
  composeDashboardLive,
  fetchHubDiagnosticsSummary,
  fetchHubHealth,
  type HubHealth
} from './hub-status'

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
  memory: { rss: 100_000_000, heapUsed: 20_000_000 },
  storage: { usedBytes: 5_242_880 },
  backup: { replicating: true, lastWriteMs: 1_700_000_000_000 }
}

describe('composeDashboardLive', () => {
  it('maps a healthy hub + SLI + AI spend into the live payload', () => {
    const out = composeDashboardLive({
      health: HEALTH,
      sli: sli(0.9994),
      aiUsedUsd: 1.23,
      quotaBytes: 10_485_760,
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
      p95LatencyMs: 40,
      errorBudgetPct: 50,
      errorBudgetPolicy: 'ship',
      sloLabel: '99.9% uptime',
      storageUsedBytes: 5_242_880,
      storageQuotaBytes: 10_485_760,
      storagePct: 50,
      backup: { replicating: true, lastWriteMs: 1_700_000_000_000 },
      aiUsedUsd: 1.23
    })
  })

  it('passes through the measured R2 sync time for the "data safe as of" line', () => {
    const out = composeDashboardLive({
      health: {
        ...HEALTH,
        backup: { replicating: true, lastWriteMs: 1_700_000_000_000, lastSyncMs: 1_700_000_000_500 }
      },
      sli: null,
      aiUsedUsd: null,
      dataTier: 'hot'
    })
    expect(out.backup).toEqual({
      replicating: true,
      lastWriteMs: 1_700_000_000_000,
      lastSyncMs: 1_700_000_000_500
    })
  })

  it('reports a null sync time for older hubs that do not measure it', () => {
    const out = composeDashboardLive({
      health: HEALTH,
      sli: null,
      aiUsedUsd: null,
      dataTier: 'hot'
    })
    expect(out.backup?.lastSyncMs).toBeNull()
  })

  it('storage fields are null without a quota or without hub storage', () => {
    const noQuota = composeDashboardLive({
      health: HEALTH,
      sli: null,
      aiUsedUsd: null,
      dataTier: 'hot'
    })
    expect(noQuota.storageUsedBytes).toBe(5_242_880)
    expect(noQuota.storageQuotaBytes).toBeNull()
    expect(noQuota.storagePct).toBeNull()
    const noStorage = composeDashboardLive({
      health: { status: 'ok' },
      sli: null,
      aiUsedUsd: null,
      quotaBytes: 1024,
      dataTier: 'hot'
    })
    expect(noStorage.storageUsedBytes).toBeNull()
    expect(noStorage.storagePct).toBeNull()
    expect(noStorage.backup).toBeNull()
  })

  it('flags overQuota when stored data exceeds the plan quota (pct saturates at 100)', () => {
    const over = composeDashboardLive({
      health: { status: 'ok', storage: { usedBytes: 30 * 1024 * 1024 } },
      sli: null,
      aiUsedUsd: null,
      quotaBytes: 25 * 1024 * 1024,
      dataTier: 'hot'
    })
    expect(over.overQuota).toBe(true)
    expect(over.storagePct).toBe(100) // saturated, so it can't distinguish "over"
    const under = composeDashboardLive({
      health: { status: 'ok', storage: { usedBytes: 10 * 1024 * 1024 } },
      sli: null,
      aiUsedUsd: null,
      quotaBytes: 25 * 1024 * 1024,
      dataTier: 'hot'
    })
    expect(under.overQuota).toBe(false)
    // Unknown usage (no quota or no storage) → null, not a misleading false.
    expect(composeDashboardLive({ health: null, sli: null, aiUsedUsd: null }).overQuota).toBeNull()
  })

  it('reports sleeping when the hub is unreachable (no health)', () => {
    const out = composeDashboardLive({ health: null, sli: null, aiUsedUsd: null, dataTier: 'cold' })
    expect(out.reachable).toBe(false)
    expect(out.state).toBe('sleeping')
    expect(out.connections).toBeNull()
    expect(out.uptimePct).toBeNull()
    expect(out.p95LatencyMs).toBeNull()
    expect(out.errorBudgetPct).toBeNull()
    expect(out.errorBudgetPolicy).toBeNull()
  })

  it('omits p95 latency when the SLI window has no samples (avoid a fake 0ms)', () => {
    const noSamples = { ...sli(1), sampleCount: 0, p95LatencyMs: 0 }
    const out = composeDashboardLive({
      health: HEALTH,
      sli: noSamples,
      aiUsedUsd: null,
      dataTier: 'hot'
    })
    expect(out.p95LatencyMs).toBeNull()
    expect(out.uptimePct).toBe(100)
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

describe('fetchHubDiagnosticsSummary (0341)', () => {
  const SUMMARY = {
    pending: 3,
    drained: 1,
    total: 4,
    lastSeenMs: 1_700_000_000_000,
    topIssues: [
      {
        fingerprint: 'abc',
        shortId: 'XR-ABC123',
        errorName: 'TypeError',
        lane: 'auto',
        surface: 'web',
        occurrences: 7,
        status: 'pending',
        firstSeenMs: 1,
        lastSeenMs: 2
      }
    ]
  }

  it('sends the per-tenant secret and validates the payload shape', async () => {
    let seenUrl = ''
    let seenSecret: string | null = null
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seenUrl = url
      seenSecret = (init.headers as Record<string, string>)['x-internal-secret']
      return new Response(JSON.stringify(SUMMARY), { status: 200 })
    }) as unknown as typeof fetch

    const out = await fetchHubDiagnosticsSummary('https://hub.example/', 'tenant-a.s3cret', {
      fetchImpl
    })
    expect(seenUrl).toBe('https://hub.example/diagnostics/summary')
    expect(seenSecret).toBe('tenant-a.s3cret')
    expect(out).toEqual(SUMMARY)
  })

  it('returns null on 401/404, malformed payloads, rejects, and missing inputs', async () => {
    const denied = (async () => new Response('no', { status: 401 })) as unknown as typeof fetch
    expect(
      await fetchHubDiagnosticsSummary('https://hub.example', 's', { fetchImpl: denied })
    ).toBeNull()

    const junk = (async () =>
      new Response('{"nope":1}', { status: 200 })) as unknown as typeof fetch
    expect(
      await fetchHubDiagnosticsSummary('https://hub.example', 's', { fetchImpl: junk })
    ).toBeNull()

    const boom = (async () => {
      throw new Error('aborted')
    }) as unknown as typeof fetch
    expect(
      await fetchHubDiagnosticsSummary('https://hub.example', 's', { fetchImpl: boom })
    ).toBeNull()

    expect(await fetchHubDiagnosticsSummary('', 's')).toBeNull()
    expect(await fetchHubDiagnosticsSummary('https://hub.example', '')).toBeNull()
  })

  it('passes through composeDashboardLive (null when absent)', () => {
    const withDiag = composeDashboardLive({
      health: HEALTH,
      sli: null,
      aiUsedUsd: null,
      diagnostics: SUMMARY
    })
    expect(withDiag.diagnostics).toEqual(SUMMARY)
    const without = composeDashboardLive({ health: HEALTH, sli: null, aiUsedUsd: null })
    expect(without.diagnostics).toBeNull()
  })
})
