import { MemoryBillingIdentityProvider } from '@xnetjs/cloud/identity'
import { describe, expect, it } from 'vitest'
import { createControlPlaneApp } from './server'
import { buildControlPlane } from './index'

const INTERNAL = 'secret123'

function app() {
  const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
  const { controlPlane } = buildControlPlane({ billing })
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
})
