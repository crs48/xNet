import { MemoryProvisioner } from '@xnetjs/cloud/provisioner'
import { describe, expect, it } from 'vitest'
import { buildControlPlane } from '../index'
import { HealthSampleStore } from '../observability/health'
import { controlPlaneRolloutDeps } from './control-plane-deps'
import { rollWave, runRollout, type RolloutEngineDeps } from './engine'

/** A deterministic in-memory deps double that records every upgrade call. */
function fakeDeps(availabilityByTenant: Record<string, number>) {
  const upgrades: { tenantId: string; target: string }[] = []
  const versions: Record<string, string> = {}
  const deps: RolloutEngineDeps = {
    async upgrade(tenantId, target) {
      upgrades.push({ tenantId, target })
      versions[tenantId] = target
    },
    async priorVersion(tenantId) {
      return versions[tenantId] ?? 'v0'
    },
    async measure(tenantId) {
      return availabilityByTenant[tenantId] ?? 1
    }
  }
  return { deps, upgrades, versions }
}

const SHIP = { budgetPolicy: async () => 'ship' as const }
const FREEZE = { budgetPolicy: async () => 'freeze' as const }

describe('rollWave', () => {
  it('promotes healthy tenants and rolls back regressions', async () => {
    const { deps, upgrades } = fakeDeps({ good: 1, bad: 0.5 })
    const res = await rollWave(deps, ['good', 'bad'], { target: 'v2', minAvailability: 0.95 })
    expect(res.promoted).toEqual(['good'])
    expect(res.rolledBack).toEqual(['bad'])
    // 'bad' was upgraded to v2 then rolled back to its prior (v0).
    expect(upgrades.filter((u) => u.tenantId === 'bad')).toEqual([
      { tenantId: 'bad', target: 'v2' },
      { tenantId: 'bad', target: 'v0' }
    ])
  })
})

describe('runRollout', () => {
  const plan = {
    target: 'v2',
    canary: ['c1'],
    waves: [['w1', 'w2'], ['w3']],
    minAvailability: 0.95
  }

  it('rolls canary then waves when healthy', async () => {
    const { deps } = fakeDeps({ c1: 1, w1: 1, w2: 1, w3: 1 })
    const report = await runRollout(deps, plan, SHIP)
    expect(report.aborted).toBe(false)
    expect(report.canary?.promoted).toEqual(['c1'])
    expect(report.waves.flatMap((w) => w.promoted)).toEqual(['w1', 'w2', 'w3'])
  })

  it('aborts before touching any tenant when the budget is frozen', async () => {
    const { deps, upgrades } = fakeDeps({ c1: 1 })
    const report = await runRollout(deps, plan, FREEZE)
    expect(report.aborted).toBe(true)
    expect(report.reason).toMatch(/frozen/)
    expect(upgrades).toHaveLength(0)
  })

  it('aborts the rollout when the canary regresses', async () => {
    const { deps } = fakeDeps({ c1: 0.5, w1: 1 })
    const report = await runRollout(deps, plan, SHIP)
    expect(report.aborted).toBe(true)
    expect(report.reason).toMatch(/canary/)
    expect(report.canary?.rolledBack).toEqual(['c1'])
    expect(report.waves).toHaveLength(0) // never reached the waves
  })

  it('freezes mid-rollout if the budget burns during waves', async () => {
    const { deps } = fakeDeps({ c1: 1, w1: 1, w2: 1, w3: 1 })
    let calls = 0
    const gate = {
      budgetPolicy: async () => (++calls >= 3 ? ('freeze' as const) : ('ship' as const))
    }
    const report = await runRollout(deps, plan, gate)
    expect(report.aborted).toBe(true)
    expect(report.reason).toMatch(/mid-rollout/)
  })
})

describe('rollout against a real ControlPlane + MemoryProvisioner', () => {
  it('promotes a healthy hub and rolls back an unhealthy one', async () => {
    const { controlPlane } = buildControlPlane({ provisioner: new MemoryProvisioner() })
    // Provision two hubs (DID-less billing path; default tag from buildControlPlane).
    await controlPlane.provisionForBilling({ plan: 'community', billingUserId: 'healthy' })
    await controlPlane.provisionForBilling({ plan: 'community', billingUserId: 'sick' })
    const healthyId = 't_healthy'
    const sickId = 't_sick'
    const baseVersion = (await controlPlane.getTenant(healthyId))!.targetVersion

    const health = new HealthSampleStore()
    for (let i = 0; i < 20; i++) {
      health.record(healthyId, { ok: true, latencyMs: 10, atMs: 1000 + i })
      health.record(sickId, { ok: i % 2 === 0, latencyMs: 10, atMs: 1000 + i }) // 50% → unhealthy
    }
    const deps = controlPlaneRolloutDeps(controlPlane, health, () => 2000)

    const res = await rollWave(deps, [healthyId, sickId], {
      target: 'xnet-hub@9.9.9',
      minAvailability: 0.95
    })
    expect(res.promoted).toEqual([healthyId])
    expect(res.rolledBack).toEqual([sickId])
    expect((await controlPlane.getTenant(healthyId))!.targetVersion).toBe('xnet-hub@9.9.9')
    expect((await controlPlane.getTenant(sickId))!.targetVersion).toBe(baseVersion) // rolled back
  })
})
