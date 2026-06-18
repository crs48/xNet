import { FakeVirtualKeyManager } from '@xnetjs/cloud'
import { MemoryBindingStore } from '@xnetjs/cloud/identity'
import { MemoryProvisioner } from '@xnetjs/cloud/provisioner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ControlPlane, currentPeriodStartMs } from './control-plane'
import { MemoryTenantStore } from './registry'

const challenge = (did: string) => ({ did, nonce: 'n', signature: 'sig' })

function build(opts: { aiKeys?: FakeVirtualKeyManager } = {}) {
  let clock = 1000
  const cp = new ControlPlane({
    tenants: new MemoryTenantStore(),
    bindings: new MemoryBindingStore(),
    provisioner: new MemoryProvisioner({
      sharding: { projectPrefix: 'test', servicesPerProject: 800 }
    }),
    verifyDid: async (c) => Boolean(c.did && c.signature),
    planSecret: 'test-secret',
    defaultTargetVersion: 'xnet-hub@1.0.0',
    ...(opts.aiKeys ? { aiKeys: opts.aiKeys } : {}),
    nowMs: () => clock
  })
  return { cp, tick: (n: number) => (clock += n) }
}

describe('ControlPlane.provisionTenant', () => {
  it('binds identities, provisions a hub, and records the tenant', async () => {
    const { cp } = build()
    const record = await cp.provisionTenant({
      tenantId: 'acme',
      plan: 'personal',
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })
    expect(record).toMatchObject({
      tenantId: 'acme',
      plan: 'personal',
      billingUserId: 'user_a',
      did: 'did:key:alice',
      targetVersion: 'xnet-hub@1.0.0'
    })
    expect(record.hubUrl).toContain('acme')
    expect(record.entitlements.isolation).toBe('dedicated-sleep')
    expect(await cp.getTenant('acme')).toMatchObject({ tenantId: 'acme' })
  })

  it('rejects a duplicate tenant and a failed DID challenge', async () => {
    const { cp } = build()
    await cp.provisionTenant({
      tenantId: 'acme',
      plan: 'personal',
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })
    await expect(
      cp.provisionTenant({
        tenantId: 'acme',
        plan: 'team',
        billingUserId: 'user_a',
        challenge: challenge('did:key:alice')
      })
    ).rejects.toThrow(/already exists/)

    await expect(
      cp.provisionTenant({
        tenantId: 'other',
        plan: 'personal',
        billingUserId: 'user_b',
        challenge: { did: 'did:key:x', nonce: 'n', signature: '' } // bad challenge
      })
    ).rejects.toThrow(/DID challenge failed/)
  })
})

describe('ControlPlane.changePlan', () => {
  let cp: ControlPlane
  beforeEach(async () => {
    cp = build().cp
    await cp.provisionTenant({
      tenantId: 'acme',
      plan: 'personal',
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })
  })

  it('flips capacity in place within the same isolation tier (no migration)', async () => {
    // personal → family are both `dedicated-sleep`.
    const result = await cp.changePlan('acme', 'family')
    expect(result.kind).toBe('flipped')
    if (result.kind === 'flipped') {
      expect(result.tenant.plan).toBe('family')
      expect(result.tenant.entitlements.quotaBytes).toBe(250 * 1024 * 1024 * 1024)
    }
  })

  it('requires migration when crossing an isolation boundary', async () => {
    // personal (dedicated-sleep) → community (dedicated-project).
    const result = await cp.changePlan('acme', 'community')
    expect(result.kind).toBe('migration-required')
    if (result.kind === 'migration-required') {
      expect(result.from.isolation).toBe('dedicated-sleep')
      expect(result.to.isolation).toBe('dedicated-project')
    }
    // The recorded tenant is unchanged until the migration runs.
    expect((await cp.getTenant('acme'))?.plan).toBe('personal')
  })

  it('treats an in-tier storage add-on as a flip', async () => {
    const result = await cp.changePlan('acme', 'personal', { quotaBytes: 100 * 1024 * 1024 * 1024 })
    expect(result.kind).toBe('flipped')
  })
})

describe('ControlPlane managed-AI key provisioning (0200)', () => {
  it('mints a budgeted virtual key for an aiEnabled tenant and stores the ref', async () => {
    const aiKeys = new FakeVirtualKeyManager()
    const { cp } = build({ aiKeys })
    const record = await cp.provisionTenant({
      tenantId: 'acme',
      plan: 'personal', // aiEnabled, $25 cap
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })
    expect(record.aiKeyRef).toBe('sk-fake-acme')
    expect(aiKeys.list()[0]?.maxBudgetUsd).toBe(25)
  })

  it('does not mint a key for the free (aiEnabled:false) tier', async () => {
    const aiKeys = new FakeVirtualKeyManager()
    const { cp } = build({ aiKeys })
    const record = await cp.provisionForBilling({ plan: 'demo', billingUserId: 'user_free' })
    expect(record.aiKeyRef).toBeUndefined()
    expect(aiKeys.list()).toHaveLength(0)
  })

  it('updates the key budget on an in-tier plan flip', async () => {
    const aiKeys = new FakeVirtualKeyManager()
    const { cp } = build({ aiKeys })
    await cp.provisionTenant({
      tenantId: 'acme',
      plan: 'personal',
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })
    await cp.changePlan('acme', 'family') // both dedicated-sleep; family cap $60
    expect(aiKeys.list()[0]?.maxBudgetUsd).toBe(60)
    expect((await cp.getTenant('acme'))?.aiKeyRef).toBe('sk-fake-acme') // unchanged ref
  })

  it('revokes the key when the tenant is deleted', async () => {
    const aiKeys = new FakeVirtualKeyManager()
    const { cp } = build({ aiKeys })
    await cp.provisionTenant({
      tenantId: 'acme',
      plan: 'personal',
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })
    expect(aiKeys.list()).toHaveLength(1)
    await cp.deleteTenant('acme')
    expect(aiKeys.list()).toHaveLength(0)
  })
})

describe('ControlPlane.setAiCap (self-serve spend cap, 0201)', () => {
  it('clamps the cap to the plan budget and clears it with undefined', async () => {
    const { cp } = build()
    await cp.provisionTenant({
      tenantId: 'acme',
      plan: 'personal', // plan cap $25
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })
    // A cap below the plan budget is kept verbatim.
    expect((await cp.setAiCap('acme', 10)).aiCapUsd).toBe(10)
    // A cap above the plan budget is clamped down to the plan cap.
    expect((await cp.setAiCap('acme', 1000)).aiCapUsd).toBe(25)
    // undefined clears it (back to the full plan cap).
    expect((await cp.setAiCap('acme', undefined)).aiCapUsd).toBeUndefined()
  })

  it('rejects a negative cap and an unknown tenant', async () => {
    const { cp } = build()
    await cp.provisionTenant({
      tenantId: 'acme',
      plan: 'personal',
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })
    await expect(cp.setAiCap('acme', -5)).rejects.toThrow(/Invalid AI cap/)
    await expect(cp.setAiCap('ghost', 5)).rejects.toThrow(/Unknown tenant/)
  })
})

describe('currentPeriodStartMs', () => {
  it('returns the UTC start of the month containing the instant', () => {
    const mid = Date.UTC(2026, 5, 17, 13, 30) // 2026-06-17T13:30Z
    expect(currentPeriodStartMs(mid)).toBe(Date.UTC(2026, 5, 1))
  })
})

describe('ControlPlane.upgradeTenant + recoverAccount', () => {
  it('rolls a tenant to a new immutable image', async () => {
    const { cp } = build()
    await cp.provisionTenant({
      tenantId: 'acme',
      plan: 'personal',
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })
    const upgraded = await cp.upgradeTenant('acme', 'xnet-hub@1.1.0')
    expect(upgraded.targetVersion).toBe('xnet-hub@1.1.0')
  })

  it('recovers the paid account off the billing identity, clearing the data DID', async () => {
    const { cp } = build()
    await cp.provisionTenant({
      tenantId: 'acme',
      plan: 'personal',
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })
    const { tenant } = await cp.recoverAccount('user_a')
    expect(tenant.tenantId).toBe('acme') // account + hub survive
    expect(tenant.did).toBe('') // data identity cleared, awaiting rebind
    expect(tenant.hubUrl).toContain('acme')
  })
})

describe('ControlPlane cold-tiering (0178)', () => {
  function coldHarness() {
    let clock = 1000
    const provisioner = new MemoryProvisioner({ sharding: { projectPrefix: 'cold' } })
    const cp = new ControlPlane({
      tenants: new MemoryTenantStore(),
      bindings: new MemoryBindingStore(),
      provisioner,
      verifyDid: async (c) => Boolean(c.did && c.signature),
      planSecret: 'test-secret',
      defaultTargetVersion: 'xnet-hub@1.0.0',
      nowMs: () => clock
    })
    const provision = () =>
      cp.provisionTenant({
        tenantId: 'acme',
        plan: 'personal',
        billingUserId: 'user_a',
        challenge: challenge('did:key:alice')
      })
    return { cp, provisioner, provision, tick: (n: number) => (clock += n) }
  }

  it('provisions hot with activity tracking', async () => {
    const { provision } = coldHarness()
    const r = await provision()
    expect(r.dataTier).toBe('hot')
    expect(r.lastActiveMs).toBe(1000)
  })

  it('demotes an idle hot tenant to cold and releases the substrate', async () => {
    const { cp, provisioner, provision, tick } = coldHarness()
    const r = await provision()
    const destroy = vi.spyOn(provisioner, 'destroy')
    tick(40 * 24 * 3600 * 1000) // 40 days idle
    const result = await cp.demoteIfCold('acme', { coldAfterMs: 30 * 24 * 3600 * 1000 })
    expect(result.demoted).toBe(true)
    expect(destroy).toHaveBeenCalledWith(r.substrateRef)
    const t = await cp.getTenant('acme')
    expect(t).toMatchObject({ dataTier: 'cold', substrateRef: '', hubUrl: '' })
  })

  it('does not demote when still active, or when not yet fully synced to R2', async () => {
    const { cp, provision, tick } = coldHarness()
    await provision()
    tick(10 * 24 * 3600 * 1000) // only 10 days idle
    expect((await cp.demoteIfCold('acme', { coldAfterMs: 30 * 24 * 3600 * 1000 })).demoted).toBe(
      false
    )

    tick(40 * 24 * 3600 * 1000) // now idle long enough
    // ...but the replica isn't fully synced yet — the demotion gate blocks destroy.
    expect(
      (
        await cp.demoteIfCold('acme', {
          coldAfterMs: 30 * 24 * 3600 * 1000,
          assertSynced: async () => false
        })
      ).demoted
    ).toBe(false)
    expect((await cp.getTenant('acme'))?.dataTier).toBe('hot')
  })

  it('markActive resets the idle clock', async () => {
    const { cp, provision, tick } = coldHarness()
    await provision()
    tick(40 * 24 * 3600 * 1000)
    await cp.markActive('acme') // fresh activity
    expect((await cp.demoteIfCold('acme', { coldAfterMs: 30 * 24 * 3600 * 1000 })).demoted).toBe(
      false
    )
  })

  it('reactivates a cold tenant by provisioning a hub that restores from R2', async () => {
    const { cp, provisioner, provision, tick } = coldHarness()
    await provision()
    tick(40 * 24 * 3600 * 1000)
    await cp.demoteIfCold('acme', { coldAfterMs: 30 * 24 * 3600 * 1000 })

    const provisionSpy = vi.spyOn(provisioner, 'provision')
    const reactivated = await cp.reactivate('acme')
    expect(reactivated.dataTier).toBe('hot')
    expect(reactivated.substrateRef).not.toBe('')
    expect(reactivated.hubUrl).toContain('acme')
    // The fresh hub is told to restore the tenant's DB snapshot from R2.
    expect(provisionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ restoreFromR2: 't/acme/db' })
    )
  })
})
