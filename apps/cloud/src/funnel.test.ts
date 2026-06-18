import { createHmac } from 'node:crypto'
import { MemoryBillingIdentityProvider } from '@xnetjs/cloud/identity'
import { describe, expect, it } from 'vitest'
import { FakeTenantBillingGateway } from './billing-gateway'
import { createControlPlaneApp } from './server'
import { buildControlPlane } from './index'

const SESSION_SECRET = 'sess-secret'

/** Build an app with the billing funnel wired (keyless fake gateway). */
function funnelApp(opts: { webhookSecret?: string } = {}) {
  const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
  billing.seed({ id: 'user_a', email: 'a@example.com', emailVerified: true }, 'code_a')
  const { controlPlane } = buildControlPlane({ billing })
  const app = createControlPlaneApp({
    controlPlane,
    billing,
    payments: new FakeTenantBillingGateway(opts.webhookSecret),
    sessionSecret: SESSION_SECRET,
    baseUrl: ''
  })
  return { app, controlPlane }
}

/** Extract the session cookie pair from a Set-Cookie response header. */
function cookieFrom(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? ''
  return setCookie.split(';')[0]
}

async function signIn(app: ReturnType<typeof funnelApp>['app']): Promise<string> {
  const res = await app.request('/auth/callback?code=code_a&state=personal')
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).toBe('/dashboard?plan=personal')
  return cookieFrom(res)
}

describe('xNet Cloud signup → provision → manage funnel', () => {
  it('seals a session on the WorkOS callback', async () => {
    const { app } = funnelApp()
    const cookie = await signIn(app)
    expect(cookie).toContain('xnet_cloud_session=')
  })

  it('rejects an invalid auth code', async () => {
    const { app } = funnelApp()
    const res = await app.request('/auth/callback?code=nope')
    expect(res.status).toBe(401)
  })

  it('redirects the dashboard to sign-in when unauthenticated', async () => {
    const { app } = funnelApp()
    const res = await app.request('/dashboard')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/auth/start')
  })

  it('shows the plan picker before a hub exists', async () => {
    const { app } = funnelApp()
    const cookie = await signIn(app)
    const res = await app.request('/dashboard', { headers: { cookie } })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Welcome to xNet Cloud')
    expect(html).toContain('action="/checkout"')
  })

  it('runs checkout → webhook → provision → dashboard end to end', async () => {
    const { app } = funnelApp()
    const cookie = await signIn(app)

    // Checkout redirects to the hosted (fake) checkout URL.
    const checkout = await app.request('/checkout', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'plan=personal'
    })
    expect(checkout.status).toBe(302)
    expect(checkout.headers.get('location')).toContain('fake_checkout=personal')

    // The provider webhook provisions the hub.
    const hook = await app.request('/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.completed', customerRef: 'user_a', plan: 'personal' })
    })
    expect(hook.status).toBe(200)

    // The tenant is now readable and tied to the billing user, DID not yet bound.
    const tenant = await app.request('/tenants/t_user_a')
    expect(tenant.status).toBe(200)
    expect(await tenant.json()).toMatchObject({
      plan: 'personal',
      billingUserId: 'user_a',
      did: '',
      subscriptionStatus: 'active'
    })

    // The dashboard now shows the hub.
    const dash = await app.request('/dashboard', { headers: { cookie } })
    const html = await dash.text()
    expect(html).toContain('Your hub')
    expect(html).toContain('Connect your app')
  })

  it('is idempotent across replayed checkout webhooks', async () => {
    const { app, controlPlane } = funnelApp()
    const body = JSON.stringify({
      type: 'checkout.completed',
      customerRef: 'user_a',
      plan: 'personal'
    })
    const post = () =>
      app.request('/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body
      })
    await post()
    await post()
    const all = await controlPlane.getTenantForBilling('user_a')
    expect(all?.tenantId).toBe('t_user_a')
    // Only one tenant exists for the billing user.
    expect((await controlPlane.getTenant('t_user_a'))?.plan).toBe('personal')
  })

  it('suspends on cancellation and retains the record', async () => {
    const { app, controlPlane } = funnelApp()
    await app.request('/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.completed', customerRef: 'user_a', plan: 'personal' })
    })
    await app.request('/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'customer.subscription.deleted', customerRef: 'user_a' })
    })
    const tenant = await controlPlane.getTenant('t_user_a')
    expect(tenant).toMatchObject({ subscriptionStatus: 'canceled', dataTier: 'cold', hubUrl: '' })
  })

  it('opens the billing portal for an authenticated user', async () => {
    const { app } = funnelApp()
    const cookie = await signIn(app)
    const res = await app.request('/portal', { method: 'POST', headers: { cookie } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('billing.local/portal')
  })

  it('deletes data and returns to the empty dashboard', async () => {
    const { app, controlPlane } = funnelApp()
    const cookie = await signIn(app)
    await app.request('/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.completed', customerRef: 'user_a', plan: 'personal' })
    })
    const del = await app.request('/account/delete-data', { method: 'POST', headers: { cookie } })
    expect(del.status).toBe(302)
    expect(await controlPlane.getTenant('t_user_a')).toBeNull()
  })

  it('guards checkout + portal behind a session', async () => {
    const { app } = funnelApp()
    expect((await app.request('/checkout', { method: 'POST', body: 'plan=personal' })).status).toBe(
      401
    )
    expect((await app.request('/portal', { method: 'POST' })).status).toBe(401)
  })

  it('verifies the webhook signature when a secret is configured', async () => {
    const { app } = funnelApp({ webhookSecret: 'whsec' })
    const body = JSON.stringify({
      type: 'checkout.completed',
      customerRef: 'user_a',
      plan: 'personal'
    })

    const unsigned = await app.request('/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    })
    expect(unsigned.status).toBe(401)

    const sig = createHmac('sha256', 'whsec').update(body).digest('hex')
    const signed = await app.request('/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-xnet-signature': sig },
      body
    })
    expect(signed.status).toBe(200)
  })

  it('accepts the same webhook at the provider-scoped /webhooks/stripe path', async () => {
    const { app, controlPlane } = funnelApp()
    const res = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.completed', customerRef: 'user_a', plan: 'personal' })
    })
    expect(res.status).toBe(200)
    expect((await controlPlane.getTenant('t_user_a'))?.plan).toBe('personal')
  })
})
