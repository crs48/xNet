/**
 * G1 regression suite (exploration 0411).
 *
 * `provisionTenant` / `provisionForBilling` touch four systems in sequence. The
 * bug these tests pin: a failure after the hub was provisioned used to leave a
 * running, billable Cloud Run service with no `TenantRecord` pointing at it,
 * and the retry provisioned a *second* one.
 */

import { FakeVirtualKeyManager } from '@xnetjs/cloud'
import { MemoryBindingStore } from '@xnetjs/cloud/identity'
import { MemoryProvisioner } from '@xnetjs/cloud/provisioner'
import { describe, expect, it, vi, type MockInstance } from 'vitest'
import { ControlPlane } from './control-plane'
import { MemoryTenantStore } from './registry'
import { SagaFailure } from './saga'

const challenge = (did: string) => ({ did, nonce: 'n', signature: 'sig' })

/**
 * A control plane whose AI-key manager can be made to fail on demand.
 *
 * `servicesPerProject` defaults to 1 so a leaked hub is *observable*: the shard
 * allocator only frees a slot on `destroy`, so a retry after an uncompensated
 * failure rolls onto shard `test-1`, while a properly compensated one reuses
 * `test-0`. That is the difference between one live hub and two.
 */
function build(
  opts: { keyMintFails?: boolean; keyRemoveFails?: boolean; servicesPerProject?: number } = {}
) {
  const provisioner = new MemoryProvisioner({
    sharding: { projectPrefix: 'test', servicesPerProject: opts.servicesPerProject ?? 1 }
  })
  const provision = vi.spyOn(provisioner, 'provision')
  const destroy = vi.spyOn(provisioner, 'destroy')

  const aiKeys = new FakeVirtualKeyManager()
  if (opts.keyMintFails) {
    vi.spyOn(aiKeys, 'create').mockRejectedValue(new Error('openrouter 503'))
  }
  if (opts.keyRemoveFails) {
    vi.spyOn(aiKeys, 'remove').mockRejectedValue(new Error('key delete 500'))
  }

  const tenants = new MemoryTenantStore()
  const cp = new ControlPlane({
    tenants,
    bindings: new MemoryBindingStore(),
    provisioner,
    verifyDid: async (c) => Boolean(c.did && c.signature),
    planSecret: 'test-secret',
    defaultTargetVersion: 'xnet-hub@1.0.0',
    aiKeys,
    nowMs: () => 1000
  })
  return { cp, provisioner, provision, destroy, tenants, aiKeys }
}

/** `personal` has aiEnabled with a non-zero budget, so the key-mint step runs. */
const PLAN = 'personal'

/** The `substrateRef` of the nth `provision` call's returned handle. */
async function refOfCall(
  provision: MockInstance<MemoryProvisioner['provision']>,
  index: number
): Promise<string> {
  const result = provision.mock.results[index]
  if (!result || result.type !== 'return') throw new Error(`no provision call at index ${index}`)
  return (await result.value).substrateRef
}

describe('G1 — provisionTenant compensates a partial failure', () => {
  it('destroys the provisioned hub when the AI key mint fails', async () => {
    const { cp, provision, destroy } = build({ keyMintFails: true })

    const err = await cp
      .provisionTenant({
        tenantId: 'acme',
        plan: PLAN,
        billingUserId: 'user_a',
        challenge: challenge('did:key:alice')
      })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(SagaFailure)
    expect((err as SagaFailure).step).toBe('mint-ai-key')

    // The hub was created, then torn down with the same substrateRef.
    expect(provision).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledWith(await refOfCall(provision, 0))
    expect((err as SagaFailure).leakedResources).toBe(false)
  })

  it('leaves no TenantRecord behind after a compensated failure', async () => {
    const { cp } = build({ keyMintFails: true })
    await cp
      .provisionTenant({
        tenantId: 'acme',
        plan: PLAN,
        billingUserId: 'user_a',
        challenge: challenge('did:key:alice')
      })
      .catch(() => undefined)

    expect(await cp.getTenant('acme')).toBeNull()
  })

  it('the retry provisions exactly one hub, not two', async () => {
    // First attempt fails at the key mint and compensates.
    const { cp, provisioner, provision, aiKeys } = build({ keyMintFails: true })
    await cp
      .provisionTenant({
        tenantId: 'acme',
        plan: PLAN,
        billingUserId: 'user_a',
        challenge: challenge('did:key:alice')
      })
      .catch(() => undefined)

    // The orphan check: nothing survives the first attempt.
    const firstRef = await refOfCall(provision, 0)
    expect(firstRef).toContain('test-0')
    expect(await provisioner.get(firstRef)).toBeNull()

    // Key manager recovers; the same call now succeeds.
    vi.mocked(aiKeys.create).mockRestore()
    const record = await cp.provisionTenant({
      tenantId: 'acme',
      plan: PLAN,
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })

    expect(record.tenantId).toBe('acme')
    expect(provision).toHaveBeenCalledTimes(2)
    // The retry reused shard test-0 — proof the first attempt's slot was freed.
    // Uncompensated, the leaked slot would have pushed this onto test-1.
    expect(record.substrateRef).toContain('test-0')
    expect(await provisioner.get(record.substrateRef)).not.toBeNull()
  })

  it('reports a failed compensation instead of silently leaking', async () => {
    // Hub provisions, key mints, then the record write fails — and tearing the
    // key down ALSO fails. The caller must be able to tell.
    const { cp, tenants } = build({ keyRemoveFails: true })
    vi.spyOn(tenants, 'put').mockRejectedValue(new Error('firestore unavailable'))

    const err = await cp
      .provisionTenant({
        tenantId: 'acme',
        plan: PLAN,
        billingUserId: 'user_a',
        challenge: challenge('did:key:alice')
      })
      .catch((e: unknown) => e)

    const failure = err as SagaFailure
    expect(failure.step).toBe('write-record')
    expect(failure.leakedResources).toBe(true)
    expect(failure.compensationFailures.map((f) => f.step)).toContain('mint-ai-key')
    expect(failure.message).toContain('ALSO FAILED')
  })

  it('still surfaces the original cause message to the caller', async () => {
    const { cp } = build()
    await expect(
      cp.provisionTenant({
        tenantId: 'acme',
        plan: PLAN,
        billingUserId: 'user_a',
        challenge: { did: '', nonce: 'n', signature: '' }
      })
    ).rejects.toThrow(/DID challenge failed/)
  })
})

describe('G1 — provisionForBilling compensates a partial failure', () => {
  it('destroys the hub when the AI key mint fails, and records nothing', async () => {
    const { cp, provision, destroy } = build({ keyMintFails: true })

    const err = await cp
      .provisionForBilling({ plan: PLAN, billingUserId: 'user_b' })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(SagaFailure)
    expect(destroy).toHaveBeenCalledWith(await refOfCall(provision, 0))
    expect(await cp.getTenantForBilling('user_b')).toBeNull()
  })

  it('a redelivered webhook after a compensated failure yields one hub', async () => {
    // Stripe retries failed webhooks, so this path is replayed automatically —
    // the orphan would otherwise recur on every redelivery.
    const { cp, provisioner, provision, aiKeys } = build({ keyMintFails: true })
    await cp.provisionForBilling({ plan: PLAN, billingUserId: 'user_b' }).catch(() => undefined)

    expect(await refOfCall(provision, 0)).toContain('test-0')

    vi.mocked(aiKeys.create).mockRestore()
    const record = await cp.provisionForBilling({ plan: PLAN, billingUserId: 'user_b' })

    expect(await provisioner.get(record.substrateRef)).not.toBeNull()
    // Reused shard test-0 → the failed attempt left nothing behind.
    expect(record.substrateRef).toContain('test-0')
  })
})
