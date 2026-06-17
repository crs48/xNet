import type { TenantRecord } from '../registry'
import { MemoryProvisioner } from '@xnetjs/cloud/provisioner'
import { resolveEntitlements } from '@xnetjs/entitlements'
import { describe, expect, it } from 'vitest'
import {
  pickDrillSample,
  runRestoreDrills,
  verifyRestore,
  type RestoreProbe
} from './restore-drill'

const tenant = (id: string): TenantRecord => ({
  tenantId: id,
  plan: 'personal',
  entitlements: resolveEntitlements('personal'),
  billingUserId: `u_${id}`,
  did: '',
  hubUrl: 'wss://x',
  substrateRef: 'ref',
  region: 'us',
  targetVersion: 'xnet-hub@0.0.1',
  createdAt: 0,
  lastActiveMs: 0,
  dataTier: 'cold'
})

const okProbe: RestoreProbe = { ready: async () => true }
const downProbe: RestoreProbe = { ready: async () => false }

describe('verifyRestore', () => {
  it('provisions a throwaway hub, asserts ready, and tears it down', async () => {
    const prov = new MemoryProvisioner()
    const destroyed: string[] = []
    const origDestroy = prov.destroy.bind(prov)
    prov.destroy = async (ref: string) => {
      destroyed.push(ref)
      return origDestroy(ref)
    }
    const res = await verifyRestore(prov, okProbe, {
      tenantId: 't_a',
      entitlements: resolveEntitlements('personal'),
      targetVersion: 'xnet-hub@0.0.1'
    })
    expect(res).toEqual({ tenantId: 't_a', ok: true })
    expect(destroyed).toHaveLength(1) // throwaway hub always torn down
  })

  it('reports a not-ready restored hub as a failure', async () => {
    const res = await verifyRestore(new MemoryProvisioner(), downProbe, {
      tenantId: 't_b',
      entitlements: resolveEntitlements('personal'),
      targetVersion: 'xnet-hub@0.0.1'
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/not ready/)
  })

  it('captures a provisioning failure instead of throwing', async () => {
    const broken = {
      substrate: 'broken',
      provision: async () => {
        throw new Error('R2 replica missing')
      }
    } as unknown as MemoryProvisioner
    const res = await verifyRestore(broken, okProbe, {
      tenantId: 't_c',
      entitlements: resolveEntitlements('personal'),
      targetVersion: 'xnet-hub@0.0.1'
    })
    expect(res).toMatchObject({ tenantId: 't_c', ok: false, error: 'R2 replica missing' })
  })
})

describe('pickDrillSample', () => {
  it('returns all tenants when fewer than the sample size', () => {
    const ts = [tenant('a'), tenant('b')]
    expect(pickDrillSample(ts, 5, 0)).toHaveLength(2)
  })

  it('rotates the sample window by day so the fleet is covered over time', () => {
    const ts = ['a', 'b', 'c', 'd'].map(tenant)
    const day0 = pickDrillSample(ts, 2, 0).map((t) => t.tenantId)
    const day1 = pickDrillSample(ts, 2, 1).map((t) => t.tenantId)
    expect(day0).toEqual(['a', 'b'])
    expect(day1).toEqual(['c', 'd'])
  })
})

describe('runRestoreDrills', () => {
  it('runs the drill across a sample and includes failures', async () => {
    const prov = new MemoryProvisioner()
    const results = await runRestoreDrills(prov, okProbe, [tenant('a'), tenant('b')])
    expect(results.map((r) => r.ok)).toEqual([true, true])
  })
})
