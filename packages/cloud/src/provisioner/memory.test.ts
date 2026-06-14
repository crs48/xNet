import { resolveEntitlements } from '@xnetjs/entitlements'
import { describe, expect, it } from 'vitest'
import { CloudRunLitestreamProvisioner } from './adapters/cloud-run-litestream'
import { MemoryProvisioner } from './memory'
import { NotImplementedError, UnknownTenantError, type ProvisionSpec } from './types'

const spec = (tenantId: string, plan = 'personal' as const): ProvisionSpec => ({
  tenantId,
  entitlements: resolveEntitlements(plan),
  targetVersion: 'hub@1.0.0',
  env: { HUB_PLAN: 'token' }
})

describe('MemoryProvisioner lifecycle', () => {
  it('provisions a running hub with a stable URL and ref', async () => {
    const p = new MemoryProvisioner()
    const handle = await p.provision(spec('alice'))
    expect(handle.tenantId).toBe('alice')
    expect(handle.state).toBe('running')
    expect(handle.hubUrl).toContain('alice')
    expect(handle.targetVersion).toBe('hub@1.0.0')
    expect(await p.get(handle.substrateRef)).toEqual(handle)
  })

  it('upgrades to a new immutable version in place', async () => {
    const p = new MemoryProvisioner()
    const h = await p.provision(spec('bob'))
    const upgraded = await p.upgrade(h.substrateRef, 'hub@1.1.0')
    expect(upgraded.targetVersion).toBe('hub@1.1.0')
    expect(upgraded.state).toBe('running')
  })

  it('flips env without moving data (entitlement flip)', async () => {
    const p = new MemoryProvisioner()
    const h = await p.provision(spec('carol'))
    const flipped = await p.setEnv(h.substrateRef, { HUB_PLAN: 'bigger' })
    expect(flipped.state).toBe('running')
    expect(flipped.substrateRef).toBe(h.substrateRef)
  })

  it('sleeps and destroys, freeing the shard slot', async () => {
    const p = new MemoryProvisioner({
      sharding: { projectPrefix: 'dev', servicesPerProject: 1 }
    })
    const h = await p.provision(spec('dave'))
    expect((await p.sleep(h.substrateRef)).state).toBe('sleeping')
    await p.destroy(h.substrateRef)
    expect(await p.get(h.substrateRef)).toBeNull()
    // Slot freed: the next tenant reuses the lowest shard rather than rolling over.
    const h2 = await p.provision(spec('erin'))
    expect(h2.substrateRef).toContain('dev-0')
  })

  it('places region from entitlement residency when no region is given', async () => {
    const p = new MemoryProvisioner()
    const h = await p.provision({
      tenantId: 'frank',
      entitlements: resolveEntitlements('enterprise', { residency: 'eu' }),
      targetVersion: 'hub@1.0.0'
    })
    expect(h.region).toBe('eu')
  })

  it('throws UnknownTenantError for operations on a missing ref', async () => {
    const p = new MemoryProvisioner()
    await expect(p.upgrade('memory://nope/x', 'v2')).rejects.toThrow(UnknownTenantError)
    await expect(p.sleep('memory://nope/x')).rejects.toThrow(UnknownTenantError)
    await expect(p.destroy('memory://nope/x')).resolves.toBeUndefined() // destroy is idempotent
  })
})

describe('cloud adapter skeletons', () => {
  it('expose the Provisioner shape but are not implemented yet', async () => {
    const p = new CloudRunLitestreamProvisioner({
      projectPrefix: 'xnet-hub',
      region: 'us-central1',
      imageRepository: 'us-docker.pkg.dev/xnet/hub',
      r2Bucket: 'xnet-blobs'
    })
    expect(p.substrate).toBe('cloud-run-litestream')
    await expect(p.provision(spec('z'))).rejects.toThrow(NotImplementedError)
  })
})
