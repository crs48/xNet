import { MemoryBillingIdentityProvider } from '@xnetjs/cloud/identity'
import { describe, expect, it } from 'vitest'
import { createControlPlaneApp } from './server'
import { SESSION_COOKIE, sealSession } from './session'
import { buildControlPlane } from './index'

const INTERNAL = 'secret123'
const SESSION_SECRET = 'session-secret-xyz'

function app() {
  const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
  const { controlPlane } = buildControlPlane({ billing, verifyDid: async () => true })
  return createControlPlaneApp({ controlPlane, billing, internalSecret: INTERNAL })
}

const provisionBody = {
  tenantId: 'acme',
  plan: 'personal',
  billingUserId: 'user_a',
  challenge: { did: 'did:key:alice', nonce: 'n', signature: 'sig' }
}

describe('control-plane HTTP API', () => {
  it('reports health', async () => {
    const res = await app().request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok', service: 'xnet-cloud' })
  })

  it('serves a public, aggregate-only /status.json that never leaks a tenant', async () => {
    const a = app()
    // Provision a real (hot, hub-bearing) tenant, then confirm it can't surface.
    await a.request('/internal/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL },
      body: JSON.stringify(provisionBody)
    })
    const res = await a.request('/status.json')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).not.toContain('acme') // the tenantId must never appear
    const status = JSON.parse(body) as {
      overall: string
      components: { id: string }[]
      errorBudgetPolicy: Record<string, number>
    }
    expect(status.overall).toBe('operational')
    expect(status.components.map((c) => c.id)).toContain('hub-fleet')
    expect(status.errorBudgetPolicy).toMatchObject({ ship: 0, caution: 0, freeze: 0 })
  })

  it('redirects /auth/start to the billing provider', async () => {
    const res = await app().request('/auth/start?state=abc')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('auth.test/authorize')
    expect(res.headers.get('location')).toContain('state=abc')
  })

  it('guards internal routes behind the shared secret', async () => {
    const res = await app().request('/internal/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(provisionBody)
    })
    expect(res.status).toBe(403)
  })

  it('provisions a tenant through the internal route and reads it back', async () => {
    const a = app()
    const res = await a.request('/internal/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL },
      body: JSON.stringify(provisionBody)
    })
    expect(res.status).toBe(201)
    const record = (await res.json()) as { tenantId: string; plan: string }
    expect(record).toMatchObject({ tenantId: 'acme', plan: 'personal' })

    const got = await a.request('/tenants/acme')
    expect(got.status).toBe(200)
    expect(await got.json()).toMatchObject({ tenantId: 'acme' })

    const missing = await a.request('/tenants/nope')
    expect(missing.status).toBe(404)
  })

  it('serves an aggregate-only usage snapshot for the /open dashboard', async () => {
    const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
    const { controlPlane } = buildControlPlane({ billing, verifyDid: async () => true })
    await controlPlane.provisionForBilling({ plan: 'personal', billingUserId: 'user_a' })
    const a = createControlPlaneApp({
      controlPlane,
      billing,
      internalSecret: INTERNAL,
      usageHubStats: {
        async stats() {
          return { documents: 7 }
        }
      }
    })

    const forbidden = await a.request('/internal/metrics/usage')
    expect(forbidden.status).toBe(403)

    const res = await a.request('/internal/metrics/usage', {
      headers: { 'x-internal-secret': INTERNAL }
    })
    expect(res.status).toBe(200)
    const usage = (await res.json()) as Record<string, unknown>
    expect(usage.hubsHosted).toBeGreaterThanOrEqual(1)
    expect(usage.documentsSynced).toBe((usage.hubsHot as number) * 7)
    expect(usage.aiTokensTotal).toBe(0) // no managed AI configured → empty ledger
    // Aggregate-only: structurally cannot carry a tenant id or hub url.
    expect(usage).not.toHaveProperty('tenantId')
    expect(usage).not.toHaveProperty('hubUrl')
  })

  it('rejects malformed provisioning input', async () => {
    const res = await app().request('/internal/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL },
      body: JSON.stringify({ tenantId: 'x' })
    })
    expect(res.status).toBe(400)
  })

  it('changes a plan via the internal route (flip vs migration)', async () => {
    const a = app()
    await a.request('/internal/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL },
      body: JSON.stringify(provisionBody)
    })
    const flip = await a.request('/internal/tenants/acme/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL },
      body: JSON.stringify({ plan: 'family' })
    })
    expect((await flip.json()).kind).toBe('flipped')

    const migrate = await a.request('/internal/tenants/acme/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL },
      body: JSON.stringify({ plan: 'community' })
    })
    expect((await migrate.json()).kind).toBe('migration-required')
  })

  it('changes plan for the signed-in tenant (flip) and reports migration for a tier cross', async () => {
    const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
    const { controlPlane } = buildControlPlane({ billing, verifyDid: async () => true })
    const tenant = await controlPlane.provisionForBilling({
      plan: 'personal',
      billingUserId: 'user_a'
    })
    const a = createControlPlaneApp({ controlPlane, billing, sessionSecret: SESSION_SECRET })
    const cookie = `${SESSION_COOKIE}=${sealSession(SESSION_SECRET, { billingUserId: 'user_a', issuedAtMs: Date.now() })}`

    // personal → family: both dedicated-sleep → live flip → redirect to dashboard.
    const flip = await a.request('/account/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: 'plan=family'
    })
    expect(flip.status).toBe(302)
    expect((await controlPlane.getTenant(tenant.tenantId))?.plan).toBe('family')

    // family → team crosses to dedicated-warm → migration notice (200 HTML, unchanged).
    const migrate = await a.request('/account/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: 'plan=team'
    })
    expect(migrate.status).toBe(200)
    expect(await migrate.text()).toContain('needs a migration')
    expect((await controlPlane.getTenant(tenant.tenantId))?.plan).toBe('family') // unchanged
  })

  it('sets a self-serve AI spend cap + window (0244)', async () => {
    const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
    const { controlPlane } = buildControlPlane({ billing, verifyDid: async () => true })
    const tenant = await controlPlane.provisionForBilling({
      plan: 'personal',
      billingUserId: 'user_a'
    })
    const a = createControlPlaneApp({ controlPlane, billing, sessionSecret: SESSION_SECRET })
    const cookie = `${SESSION_COOKIE}=${sealSession(SESSION_SECRET, { billingUserId: 'user_a', issuedAtMs: Date.now() })}`

    const set = await a.request('/account/ai-budget', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: 'cap=5&window=calendar-week'
    })
    expect(set.status).toBe(302)
    expect((await controlPlane.getTenant(tenant.tenantId))?.aiBudget).toEqual({
      capUsd: 5,
      window: { kind: 'calendar-week' }
    })

    // Clearing the cap returns to the full plan budget.
    const clear = await a.request('/account/ai-budget', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: 'cap='
    })
    expect(clear.status).toBe(302)
    expect((await controlPlane.getTenant(tenant.tenantId))?.aiBudget).toBeUndefined()

    // A malformed cap is rejected (400).
    const bad = await a.request('/account/ai-budget', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: 'cap=-3'
    })
    expect(bad.status).toBe(400)
  })

  it('rejects an unauthenticated plan change', async () => {
    const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
    const { controlPlane } = buildControlPlane({ billing, verifyDid: async () => true })
    const a = createControlPlaneApp({ controlPlane, billing, sessionSecret: SESSION_SECRET })
    const res = await a.request('/account/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'plan=family'
    })
    expect(res.status).toBe(401)
  })

  it('shows an over-quota notice (no flip) when a downgrade would not fit (0216)', async () => {
    const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
    const GiB = 1024 * 1024 * 1024
    const { controlPlane } = buildControlPlane({
      billing,
      readUsageBytes: async () => 200 * GiB // family-sized data
    })
    const tenant = await controlPlane.provisionForBilling({
      plan: 'family',
      billingUserId: 'user_a'
    })
    const a = createControlPlaneApp({ controlPlane, billing, sessionSecret: SESSION_SECRET })
    const cookie = `${SESSION_COOKIE}=${sealSession(SESSION_SECRET, { billingUserId: 'user_a', issuedAtMs: Date.now() })}`

    // family (250 GiB) → personal (25 GiB) with 200 GiB stored → over-quota notice.
    const res = await a.request('/account/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: 'plan=personal'
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("doesn't fit")
    expect(html).toContain('/account/plan/wipe')
    expect((await controlPlane.getTenant(tenant.tenantId))?.plan).toBe('family') // unchanged
  })

  it('wipes data and switches plan only with an explicit confirm (0216)', async () => {
    const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
    const { controlPlane } = buildControlPlane({ billing, readUsageBytes: async () => null })
    const tenant = await controlPlane.provisionForBilling({
      plan: 'family',
      billingUserId: 'user_a'
    })
    const a = createControlPlaneApp({ controlPlane, billing, sessionSecret: SESSION_SECRET })
    const cookie = `${SESSION_COOKIE}=${sealSession(SESSION_SECRET, { billingUserId: 'user_a', issuedAtMs: Date.now() })}`

    // Without the confirm field → refused, nothing changes.
    const noConfirm = await a.request('/account/plan/wipe', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: 'plan=personal'
    })
    expect(noConfirm.status).toBe(400)
    expect((await controlPlane.getTenant(tenant.tenantId))?.plan).toBe('family')

    // With confirm=wipe → fresh empty hub on the smaller plan.
    const wiped = await a.request('/account/plan/wipe', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: 'plan=personal&confirm=wipe'
    })
    expect(wiped.status).toBe(302)
    expect((await controlPlane.getTenant(tenant.tenantId))?.plan).toBe('personal')
  })

  it('mounts POST /ai/chat only when AI deps are configured', async () => {
    const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
    const { controlPlane } = buildControlPlane({ billing, verifyDid: async () => true })

    // Without `ai`, the route is absent (404).
    const without = createControlPlaneApp({ controlPlane, billing })
    expect((await without.request('/ai/chat', { method: 'POST' })).status).toBe(404)

    // With `ai`, the route is mounted; an unresolved tenant yields 401 (not 404).
    const { FakeStripeBilling, MemoryUsageLedger } = await import('@xnetjs/cloud')
    const withAi = createControlPlaneApp({
      controlPlane,
      billing,
      ai: {
        gateway: {
          chat: async () => ({
            text: '',
            model: 'm',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
          })
        },
        ledger: new MemoryUsageLedger(),
        billing: new FakeStripeBilling(),
        pricingFor: () => ({ inputUsdPerMillion: 3, outputUsdPerMillion: 15, markup: 1.25 }),
        resolveTenant: async () => null
      }
    })
    const res = await withAi.request('/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(res.status).toBe(401)
  })
})
