/**
 * The negative control for exploration 0436 G2.
 *
 * Behind the old fleet-wide `x-internal-secret`, `/ai/chat` took the calling
 * tenant from an `x-tenant-id` header. Any hub in the fleet held that secret, so
 * any hub could name any tenant and spend their AI budget against their Stripe
 * customer. These tests assert the header cannot decide identity any more: the
 * tenant is read out of a per-tenant, self-identifying gateway token.
 *
 * A green run here is only meaningful because the first test proves the harness
 * can observe a WRONG answer — it asserts A, presented with B's header.
 */

import { FakeVirtualKeyManager } from '@xnetjs/cloud'
import { MemoryBindingStore } from '@xnetjs/cloud/identity'
import { MemoryProvisioner } from '@xnetjs/cloud/provisioner'
import { describe, expect, it } from 'vitest'
import { ControlPlane } from '../control-plane'
import { MemoryTenantStore } from '../registry'
import { gatewayTokenFor } from '../tenant-secrets'
import { aiChatDepsFromEnv } from './wiring'

const GATEWAY_MASTER = 'gw-master'

const env = (o: Record<string, string>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv

/** A minimal Hono-ish context: the resolver only ever reads request headers. */
const ctx = (headers: Record<string, string>) =>
  ({
    req: { header: (k: string) => headers[k.toLowerCase()] }
  }) as unknown as Parameters<NonNullable<ReturnType<typeof deps>>['resolveTenant']>[0]

function controlPlane(): ControlPlane {
  return new ControlPlane({
    tenants: new MemoryTenantStore(),
    bindings: new MemoryBindingStore(),
    provisioner: new MemoryProvisioner(),
    verifyDid: async () => true,
    planSecret: 'plan-master',
    defaultTargetVersion: 'xnet-hub@1.0.0',
    aiKeys: new FakeVirtualKeyManager(),
    managedAi: { cloudUrl: 'https://cloud.example', gatewayMaster: GATEWAY_MASTER }
  })
}

function deps(cp: ControlPlane) {
  return aiChatDepsFromEnv(
    cp,
    { async record() {}, async totalChargeUsd() {}, async entries() {} } as never,
    env({
      AI_GATEWAY_BASE_URL: 'http://litellm:4000',
      XNET_CLOUD_GATEWAY_MASTER: GATEWAY_MASTER
    })
  )
}

async function seedTenant(cp: ControlPlane, billingUserId: string): Promise<string> {
  const record = await cp.provisionForBilling({ plan: 'personal', billingUserId })
  return record.tenantId
}

describe('managed-AI gateway authentication (0436 G2)', () => {
  it('resolves the tenant from the token, not from x-tenant-id', async () => {
    const cp = controlPlane()
    const a = await seedTenant(cp, 'alice')
    const b = await seedTenant(cp, 'bob')
    expect(a).not.toBe(b)
    const resolve = deps(cp)!.resolveTenant

    // Tenant A's credential, tenant B's header. The old code read the header.
    const resolved = await resolve(
      ctx({
        authorization: `Bearer ${gatewayTokenFor(GATEWAY_MASTER, a)}`,
        'x-tenant-id': b
      })
    )
    expect(resolved?.tenantId).toBe(a)
  })

  it('refuses a request that carries only a tenant id', async () => {
    const cp = controlPlane()
    const a = await seedTenant(cp, 'alice')
    const resolve = deps(cp)!.resolveTenant
    expect(await resolve(ctx({ 'x-tenant-id': a }))).toBeNull()
  })

  it('refuses the fleet master presented as a bearer token', async () => {
    const cp = controlPlane()
    await seedTenant(cp, 'alice')
    const resolve = deps(cp)!.resolveTenant
    expect(await resolve(ctx({ authorization: `Bearer ${GATEWAY_MASTER}` }))).toBeNull()
  })

  it('refuses a token whose tenant id was edited to name someone else', async () => {
    const cp = controlPlane()
    const a = await seedTenant(cp, 'alice')
    const b = await seedTenant(cp, 'bob')
    const forged = gatewayTokenFor(GATEWAY_MASTER, a).replace(a, b)
    const resolve = deps(cp)!.resolveTenant
    expect(await resolve(ctx({ authorization: `Bearer ${forged}` }))).toBeNull()
  })

  it('accepts the token on x-gateway-token as well as Authorization', async () => {
    const cp = controlPlane()
    const a = await seedTenant(cp, 'alice')
    const resolve = deps(cp)!.resolveTenant
    const resolved = await resolve(ctx({ 'x-gateway-token': gatewayTokenFor(GATEWAY_MASTER, a) }))
    expect(resolved?.tenantId).toBe(a)
  })
})
