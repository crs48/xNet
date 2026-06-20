import type { UsageEntry, UsageLedger } from '@xnetjs/cloud/billing'
import { describe, expect, it } from 'vitest'
import { gateUsage } from './rollup'
import {
  collectUsage,
  httpHubUsageProbe,
  type HubUsageProbe,
  type StorageUsageReader,
  type UsageTenant
} from './usage'

const tenant = (id: string, tier: 'hot' | 'cold', hubUrl = `https://${id}.hub`): UsageTenant => ({
  tenantId: id,
  dataTier: tier,
  hubUrl: tier === 'hot' ? hubUrl : ''
})

const entry = (input: number, output: number): UsageEntry => ({
  key: `${input}:${output}`,
  tenantId: 't',
  inputTokens: input,
  outputTokens: output,
  model: 'test',
  chargeUsd: 0.01,
  providerCostUsd: 0.005,
  timestampMs: 0
})

/** A ledger backed by a fixed entry list (period scoping is irrelevant to these tests). */
const fakeLedger = (entries: UsageEntry[]): UsageLedger => ({
  async totalChargeUsd() {
    return entries.reduce((s, e) => s + e.chargeUsd, 0)
  },
  async entries() {
    return entries
  }
})

const fakeHubStats = (
  byUrl: Record<string, { documents: number; members?: number }>
): HubUsageProbe => ({
  async stats(hubUrl) {
    return byUrl[hubUrl] ?? null
  }
})

describe('collectUsage', () => {
  it('counts hubs (hot + cold), documents from hot hubs, and AI from the ledger', async () => {
    const usage = await collectUsage({
      listTenants: async () => [tenant('a', 'hot'), tenant('b', 'hot'), tenant('c', 'cold')],
      ledger: fakeLedger([entry(100, 50), entry(20, 30)]),
      hubStats: fakeHubStats({
        'https://a.hub': { documents: 12 },
        'https://b.hub': { documents: 30 }
      })
    })
    expect(usage.hubsHosted).toBe(3)
    expect(usage.hubsHot).toBe(2)
    expect(usage.documentsSynced).toBe(42)
    expect(usage.aiTokensTotal).toBe(200) // 100+50+20+30
    expect(usage.aiRequestsTotal).toBe(2)
    expect(usage.storageGb).toBeUndefined()
    expect(usage.peopleOnPlatform).toBeUndefined()
  })

  it('never probes cold hubs (they would cold-start)', async () => {
    const probed: string[] = []
    const usage = await collectUsage({
      listTenants: async () => [tenant('hot', 'hot'), tenant('cold', 'cold')],
      ledger: fakeLedger([]),
      hubStats: {
        async stats(hubUrl) {
          probed.push(hubUrl)
          return { documents: 5 }
        }
      }
    })
    expect(probed).toEqual(['https://hot.hub'])
    expect(usage.documentsSynced).toBe(5)
  })

  it('tolerates a hub that fails to answer (its docs are omitted, not a throw)', async () => {
    const usage = await collectUsage({
      listTenants: async () => [tenant('a', 'hot'), tenant('b', 'hot')],
      ledger: fakeLedger([]),
      hubStats: {
        async stats(hubUrl) {
          if (hubUrl === 'https://b.hub') throw new Error('down')
          return { documents: 9 }
        }
      }
    })
    expect(usage.documentsSynced).toBe(9)
  })

  it('includes storageGb (rounded) when a storage reader is provided', async () => {
    const storage: StorageUsageReader = {
      async totalBytes() {
        return 36_700_000_000
      }
    }
    const usage = await collectUsage({
      listTenants: async () => Array.from({ length: 8 }, (_, i) => tenant(`t${i}`, 'hot')),
      ledger: fakeLedger([]),
      storage
    })
    expect(usage.storageGb).toBe(36.7)
  })

  it('includes peopleOnPlatform only when at least one hub reports members', async () => {
    const usage = await collectUsage({
      listTenants: async () => [tenant('a', 'hot'), tenant('b', 'hot')],
      ledger: fakeLedger([]),
      hubStats: fakeHubStats({
        'https://a.hub': { documents: 1, members: 7 },
        'https://b.hub': { documents: 1 } // no members reported
      })
    })
    expect(usage.peopleOnPlatform).toBe(7)
  })

  it('omits peopleOnPlatform when no hub reports membership', async () => {
    const usage = await collectUsage({
      listTenants: async () => [tenant('a', 'hot')],
      ledger: fakeLedger([]),
      hubStats: fakeHubStats({ 'https://a.hub': { documents: 1 } })
    })
    expect(usage.peopleOnPlatform).toBeUndefined()
  })

  it('works with no hub-stats probe (Tier 0 minus documents)', async () => {
    const usage = await collectUsage({
      listTenants: async () => [tenant('a', 'hot')],
      ledger: fakeLedger([entry(5, 5)])
    })
    expect(usage.documentsSynced).toBe(0)
    expect(usage.aiTokensTotal).toBe(10)
  })
})

describe('gateUsage (k-anonymity)', () => {
  const base = {
    hubsHosted: 4,
    hubsHot: 4,
    documentsSynced: 100,
    aiTokensTotal: 0,
    aiRequestsTotal: 0
  }
  it('suppresses the whole block below the cohort floor', () => {
    expect(gateUsage(base, 5)).toBeUndefined()
  })
  it('publishes at or above the floor', () => {
    expect(gateUsage({ ...base, hubsHosted: 5 }, 5)).toEqual({ ...base, hubsHosted: 5 })
  })
})

describe('httpHubUsageProbe', () => {
  const probeWith = (impl: typeof fetch) => httpHubUsageProbe(impl, 1000)

  it('reads docs.total (and members) from a hub /health', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ docs: { hot: 3, warm: 9, total: 48 }, members: 11 }), {
        status: 200
      })) as unknown as typeof fetch
    expect(await probeWith(fetchImpl).stats('https://h.hub/')).toEqual({
      documents: 48,
      members: 11
    })
  })

  it('returns null on a non-2xx', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch
    expect(await probeWith(fetchImpl).stats('https://h.hub')).toBeNull()
  })

  it('returns null when the hub is unreachable', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    expect(await probeWith(fetchImpl).stats('https://h.hub')).toBeNull()
  })

  it('defaults documents to 0 when the payload omits docs', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })) as unknown as typeof fetch
    expect(await probeWith(fetchImpl).stats('https://h.hub')).toEqual({ documents: 0 })
  })
})
