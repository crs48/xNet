import { MemoryBillingIdentityProvider } from '@xnetjs/cloud/identity'
import { describe, expect, it } from 'vitest'
import { FakeTenantBillingGateway } from './billing-gateway'
import { HealthSampleStore } from './observability/health'
import { createControlPlaneApp } from './server'
import { buildControlPlane } from './index'

const INTERNAL = 'secret123'

function fleetApp() {
  const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
  const { controlPlane } = buildControlPlane({ billing })
  const health = new HealthSampleStore()
  const app = createControlPlaneApp({
    controlPlane,
    billing,
    payments: new FakeTenantBillingGateway(),
    health,
    internalSecret: INTERNAL,
    sessionSecret: 'sess',
    baseUrl: '',
    nowMs: () => 2_000_000 // fixed clock so recorded samples fall inside the SLO window
  })
  return { app, controlPlane, health }
}

async function provision(
  app: ReturnType<typeof fleetApp>['app'],
  customerRef: string,
  plan = 'community'
) {
  await app.request('/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'checkout.completed', customerRef, plan })
  })
}

describe('GET /internal/fleet/health', () => {
  it('guards behind the internal secret', async () => {
    const { app } = fleetApp()
    expect((await app.request('/internal/fleet/health')).status).toBe(403)
  })

  it('reports per-tenant SLIs + a fleet aggregate', async () => {
    const { app, controlPlane, health } = fleetApp()
    await provision(app, 'user_a', 'community')
    const tenant = await controlPlane.getTenantForBilling('user_a')

    // Record some failing samples for the live tenant → budget should drain.
    for (let i = 0; i < 20; i++) {
      health.record(tenant!.tenantId, { ok: i % 2 === 0, latencyMs: 10, atMs: 1000 + i })
    }

    const res = await app.request('/internal/fleet/health', {
      headers: { 'x-internal-secret': INTERNAL }
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      fleet: { tenantCount: number; freezing: number; worstBudgetRemaining: number }
      cold: number
      tenants: { tenantId: string; availability: number; policy: string }[]
    }
    expect(body.fleet.tenantCount).toBe(1)
    expect(body.tenants[0].availability).toBeCloseTo(0.5, 5)
    expect(body.tenants[0].policy).toBe('freeze')
    expect(body.fleet.freezing).toBe(1)
  })

  it('503s when observability is not configured', async () => {
    const billing = new MemoryBillingIdentityProvider()
    const { controlPlane } = buildControlPlane({ billing })
    const app = createControlPlaneApp({ controlPlane, billing, internalSecret: INTERNAL })
    const res = await app.request('/internal/fleet/health', {
      headers: { 'x-internal-secret': INTERNAL }
    })
    expect(res.status).toBe(503)
  })
})
