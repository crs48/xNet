/**
 * The doors that were shut (exploration 0436 G6/G7/G8/G9).
 *
 * Four of seven plans had no purchase path, including the free tier the pricing
 * page's primary CTA pointed at. These drive the real routes end to end, because
 * the failure was never inside a function — every function worked — it was that
 * nothing connected them to a visitor.
 */

import { MemoryBillingIdentityProvider } from '@xnetjs/cloud/identity'
import {
  CloudRunLitestreamProvisioner,
  FakeCloudRunClient,
  MemoryProvisioner
} from '@xnetjs/cloud/provisioner'
import { describe, expect, it } from 'vitest'
import { FakeTenantBillingGateway } from './billing-gateway'
import { buildControlPlane, rehydrateShards } from './index'
import { MemorySalesLeadStore } from './leads'
import { MemoryTenantStore, type TenantRecord } from './registry'
import { createControlPlaneApp } from './server'

function doorsApp(tenants = new MemoryTenantStore()) {
  const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
  billing.seed({ id: 'user_a', email: 'a@example.com', emailVerified: true }, 'code_a')
  const { controlPlane } = buildControlPlane({ billing, tenants })
  const app = createControlPlaneApp({
    controlPlane,
    billing,
    payments: new FakeTenantBillingGateway(),
    leads: new MemorySalesLeadStore(),
    sessionSecret: 'sess-secret',
    baseUrl: ''
  })
  return { app, controlPlane, tenants }
}

type App = ReturnType<typeof doorsApp>['app']

async function signIn(app: App): Promise<string> {
  const res = await app.request('/auth/callback?code=code_a')
  return (res.headers.get('set-cookie') ?? '').split(';')[0]
}

const FORM = 'application/x-www-form-urlencoded'

describe('the free tier (G6)', () => {
  it('provisions a pooled demo hub from the CTA, with no card', async () => {
    const { app, controlPlane } = doorsApp()
    const cookie = await signIn(app)
    const res = await app.request('/account/start-free', { method: 'POST', headers: { cookie } })
    expect(res.status).toBe(302)

    const tenant = await controlPlane.getTenantForBilling('user_a')
    expect(tenant?.plan).toBe('demo')
    expect(tenant?.entitlements.isolation).toBe('pooled')
    expect(tenant?.hubUrl).toBeTruthy()
  })

  it('is idempotent — a double submit does not provision twice', async () => {
    const { app, controlPlane } = doorsApp()
    const cookie = await signIn(app)
    await app.request('/account/start-free', { method: 'POST', headers: { cookie } })
    await app.request('/account/start-free', { method: 'POST', headers: { cookie } })
    expect(await controlPlane.listTenants()).toHaveLength(1)
  })

  it('requires a session — an anonymous POST goes to sign-in, not to a hub', async () => {
    const { app, controlPlane } = doorsApp()
    const res = await app.request('/account/start-free', { method: 'POST' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/auth/start')
    expect(await controlPlane.listTenants()).toHaveLength(0)
  })
})

describe('community is buyable (G7)', () => {
  it('checks out and provisions with no operator involvement', async () => {
    const { app, controlPlane } = doorsApp()
    const cookie = await signIn(app)
    const checkout = await app.request('/checkout', {
      method: 'POST',
      headers: { cookie, 'content-type': FORM },
      body: 'plan=community'
    })
    expect(checkout.status).toBe(302)

    await app.request('/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.completed', customerRef: 'user_a', plan: 'community' })
    })
    const tenant = await controlPlane.getTenantForBilling('user_a')
    expect(tenant?.plan).toBe('community')
    // Flat-billed: members are unlimited and uncounted, which is the Charter
    // receipt this plan exists to be.
    expect(tenant?.entitlements.seats).toBe(0)
  })

  it('still refuses a plan that is contact-sales only', async () => {
    const { app } = doorsApp()
    const cookie = await signIn(app)
    const res = await app.request('/checkout', {
      method: 'POST',
      headers: { cookie, 'content-type': FORM },
      body: 'plan=enterprise'
    })
    expect(res.status).toBe(400)
  })
})

describe('contact sales', () => {
  it('captures a lead for enterprise', async () => {
    const { app } = doorsApp()
    const res = await app.request('/contact', {
      method: 'POST',
      headers: { 'content-type': FORM },
      body: 'email=cto%40acme.test&plan=enterprise&orgName=Acme&seats=40'
    })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('rejects a self-serve plan and a malformed address', async () => {
    const { app } = doorsApp()
    const wrongPlan = await app.request('/contact', {
      method: 'POST',
      headers: { 'content-type': FORM },
      body: 'email=cto%40acme.test&plan=personal'
    })
    expect(wrongPlan.status).toBe(400)
    const noEmail = await app.request('/contact', {
      method: 'POST',
      headers: { 'content-type': FORM },
      body: 'email=nope&plan=enterprise'
    })
    expect(noEmail.status).toBe(400)
  })
})

const tenantAt = (id: string, substrateRef: string): TenantRecord =>
  ({
    tenantId: id,
    plan: 'personal',
    entitlements: { plan: 'personal' },
    billingUserId: id,
    did: '',
    hubUrl: '',
    substrateRef,
    region: 'us-central1',
    targetVersion: 'v1',
    createdAt: 0,
    lastActiveMs: 0,
    dataTier: 'hot'
  }) as unknown as TenantRecord

const cloudRun = (servicesPerProject?: number) =>
  new CloudRunLitestreamProvisioner(
    {
      projectPrefix: 'xnet-hub',
      region: 'us-central1',
      imageRepository: 'repo/hub',
      r2Bucket: 'b',
      r2Endpoint: 'https://r2',
      r2AccessKeyId: 'k',
      r2SecretAccessKey: 's',
      ...(servicesPerProject ? { servicesPerProject } : {})
    },
    new FakeCloudRunClient()
  )

describe('shard bookkeeping survives a restart (G9)', () => {
  it('replays stored placements so the next provision skips the full shard', async () => {
    const tenants = new MemoryTenantStore()
    // A shard that filled up before the (simulated) restart.
    await tenants.put(tenantAt('t_1', 'xnet-hub-0/us-central1/t-1'))
    await tenants.put(tenantAt('t_2', 'xnet-hub-0/us-central1/t-2'))

    const provisioner = cloudRun(2)
    const { controlPlane } = buildControlPlane({
      tenants,
      provisioner,
      billing: new MemoryBillingIdentityProvider('https://auth.test/authorize')
    })
    expect(await rehydrateShards(controlPlane, { info: () => {} })).toBe(2)

    const handle = await provisioner.provision({
      tenantId: 't_3',
      entitlements: { plan: 'personal', sla: 'best-effort' } as never,
      targetVersion: 'v1',
      env: {}
    })
    // Without the replay this lands in xnet-hub-0, which is already at its cap,
    // and Cloud Run answers RESOURCE_EXHAUSTED — after Stripe has charged.
    expect(handle.substrateRef.startsWith('xnet-hub-1/')).toBe(true)
  })

  // The negative control: the same fleet, no replay, walks straight back into
  // the full shard. Green above means nothing without this.
  it('without the replay it targets the full shard', async () => {
    const provisioner = cloudRun(2)
    const handle = await provisioner.provision({
      tenantId: 't_3',
      entitlements: { plan: 'personal', sla: 'best-effort' } as never,
      targetVersion: 'v1',
      env: {}
    })
    expect(handle.substrateRef.startsWith('xnet-hub-0/')).toBe(true)
  })

  it('is a clean no-op on a substrate with no shard bookkeeping', async () => {
    const tenants = new MemoryTenantStore()
    await tenants.put(tenantAt('t_1', 'memory://xnet-hub-dev/t_1'))
    const { controlPlane } = buildControlPlane({
      tenants,
      provisioner: new MemoryProvisioner(),
      billing: new MemoryBillingIdentityProvider('https://auth.test/authorize')
    })
    expect(await rehydrateShards(controlPlane, { info: () => {} })).toBe(0)
  })
})

describe('residency is honoured by the production adapter (G8)', () => {
  it('places a region-pinned tenant in its residency region', async () => {
    const handle = await cloudRun().provision({
      tenantId: 't_eu',
      entitlements: { plan: 'enterprise', sla: 'custom', residency: 'europe-west1' } as never,
      targetVersion: 'v1',
      env: {}
    })
    // Read from the substrateRef, not from the entitlement field: the whole bug
    // was that the field said one thing and the placement did another.
    expect(handle.substrateRef.split('/')[1]).toBe('europe-west1')
    expect(handle.region).toBe('europe-west1')
  })

  it('falls back to the configured region when unpinned', async () => {
    const handle = await cloudRun().provision({
      tenantId: 't_us',
      entitlements: { plan: 'personal', sla: 'best-effort' } as never,
      targetVersion: 'v1',
      env: {}
    })
    expect(handle.substrateRef.split('/')[1]).toBe('us-central1')
  })

  it('lets an explicit operator region override the pin', async () => {
    const handle = await cloudRun().provision({
      tenantId: 't_ov',
      entitlements: { plan: 'enterprise', sla: 'custom', residency: 'europe-west1' } as never,
      targetVersion: 'v1',
      region: 'asia-northeast1',
      env: {}
    })
    expect(handle.substrateRef.split('/')[1]).toBe('asia-northeast1')
  })
})
