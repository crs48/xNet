import type { FleetSummary } from './health'
import { describe, expect, it } from 'vitest'
import { STATUS_K_ANON_FLOOR, publicStatus } from './status'

const fleet = (over: Partial<FleetSummary> = {}): FleetSummary => ({
  tenantCount: 0,
  worstBudgetRemaining: 1,
  freezing: 0,
  byPolicy: { ship: 0, caution: 0, freeze: 0 },
  ...over
})

const component = (s: ReturnType<typeof publicStatus>, id: string) =>
  s.components.find((c) => c.id === id)!

describe('publicStatus', () => {
  it('reports operational with no fleet data', () => {
    const s = publicStatus({
      nowMs: 1000,
      fleet: fleet(),
      availabilities: [],
      aiConfigured: false,
      backupsHealthy: null
    })
    expect(s.overall).toBe('operational')
    expect(component(s, 'control-plane').status).toBe('operational')
    expect(component(s, 'hub-fleet').availability).toBeNull() // no tenants → suppressed
    expect(component(s, 'ai-gateway').status).toBe('not-configured')
    expect(component(s, 'backups').status).toBe('not-configured')
  })

  it('publishes the fleet availability only at/above the k-anon floor', () => {
    const below = publicStatus({
      nowMs: 1,
      fleet: fleet({ tenantCount: STATUS_K_ANON_FLOOR - 1 }),
      availabilities: Array(STATUS_K_ANON_FLOOR - 1).fill(0.99),
      aiConfigured: true,
      backupsHealthy: true
    })
    expect(component(below, 'hub-fleet').availability).toBeNull()

    const at = publicStatus({
      nowMs: 1,
      fleet: fleet({ tenantCount: STATUS_K_ANON_FLOOR }),
      availabilities: Array(STATUS_K_ANON_FLOOR).fill(0.999),
      aiConfigured: true,
      backupsHealthy: true
    })
    expect(component(at, 'hub-fleet').availability).toBeCloseTo(0.999, 4)
    expect(component(at, 'ai-gateway').status).toBe('operational')
    expect(component(at, 'backups').status).toBe('operational')
  })

  it('degrades the hub fleet (and overall) when any tenant has frozen its budget', () => {
    const s = publicStatus({
      nowMs: 1,
      fleet: fleet({ tenantCount: 6, freezing: 1, byPolicy: { ship: 5, caution: 0, freeze: 1 } }),
      availabilities: [1, 1, 1, 1, 1, 0.4],
      aiConfigured: true,
      backupsHealthy: true
    })
    expect(component(s, 'hub-fleet').status).toBe('degraded')
    expect(s.overall).toBe('degraded')
    expect(s.errorBudgetPolicy.freeze).toBe(1)
  })

  it('marks backups degraded when the replica is stale', () => {
    const s = publicStatus({
      nowMs: 1,
      fleet: fleet(),
      availabilities: [],
      aiConfigured: false,
      backupsHealthy: false
    })
    expect(component(s, 'backups').status).toBe('degraded')
    expect(s.overall).toBe('degraded')
  })

  it('never serializes anything tenant-identifying', () => {
    const s = publicStatus({
      nowMs: 1,
      fleet: fleet({ tenantCount: 7, byPolicy: { ship: 7, caution: 0, freeze: 0 } }),
      availabilities: [1, 1, 1, 1, 1, 1, 0.95],
      aiConfigured: true,
      backupsHealthy: true
    })
    const json = JSON.stringify(s)
    for (const banned of ['tenantId', 'hubUrl', 'did', 'billingUserId', 'email']) {
      expect(json).not.toContain(banned)
    }
  })
})
