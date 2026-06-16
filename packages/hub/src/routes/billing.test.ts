import type { MiddlewareHandler } from 'hono'
import { MemoryBillingStore, createFakeProvider, signStripePayload } from '@xnetjs/billing'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createBillingRoutes } from './billing'

const authAs =
  (did: string): MiddlewareHandler =>
  async (c, next) => {
    c.set('auth', { did, can: () => true })
    await next()
  }

const sub = (did: string) =>
  JSON.stringify({
    id: 'evt_sub',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: 'sub_1',
        status: 'active',
        metadata: { did },
        items: { data: [{ price: { id: 'price_pro' } }] }
      }
    }
  })

function mount(opts: {
  provider?: ReturnType<typeof createFakeProvider> | null
  did?: string
  pricePlans?: Record<string, string>
}) {
  const store = new MemoryBillingStore()
  const app = new Hono()
  app.route(
    '/billing',
    createBillingRoutes({
      provider: opts.provider === undefined ? createFakeProvider() : opts.provider,
      store,
      requireAuth: authAs(opts.did ?? 'did:key:alice'),
      appUrl: 'https://app.example',
      pricePlans: opts.pricePlans
    })
  )
  return { app, store }
}

describe('billing routes', () => {
  it('streams a webhook into the store and reflects it in /me', async () => {
    const { app } = mount({})
    const webhook = await app.request('/billing/webhook', {
      method: 'POST',
      body: sub('did:key:alice')
    })
    expect(webhook.status).toBe(200)
    expect(await webhook.json()).toMatchObject({ received: true, mutations: 1 })

    const me = await app.request('/billing/me')
    const state = await me.json()
    expect(state.subscription).toMatchObject({ status: 'active', priceRef: 'price_pro' })
  })

  it('exposes plan entitlements for an active mapped subscription (0187 tie-in)', async () => {
    const { app, store } = mount({ pricePlans: { price_pro: 'team' } })
    // No subscription yet → null entitlements.
    const before = await (await app.request('/billing/entitlements')).json()
    expect(before.entitlements).toBeNull()

    await store.applyMutation({
      kind: 'subscription',
      data: {
        id: 'sub_1',
        did: 'did:key:alice',
        provider: 'fake',
        externalRef: 'sub_1',
        status: 'active',
        priceRef: 'price_pro',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: 1
      }
    })
    const after = await (await app.request('/billing/entitlements')).json()
    expect(after.entitlements?.plan).toBe('team')
  })

  it('scopes /me to the caller — other DIDs see nothing', async () => {
    const { app, store } = mount({ did: 'did:key:bob' })
    // Alice's subscription is in the store, but the caller is bob.
    await store.applyMutation({
      kind: 'subscription',
      data: {
        id: 'sub_alice',
        did: 'did:key:alice',
        provider: 'fake',
        externalRef: 'sub_alice',
        status: 'active',
        priceRef: 'price_pro',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: 1
      }
    })
    const state = await (await app.request('/billing/me')).json()
    expect(state.subscriptions).toEqual([])
    expect(state.subscription).toBeNull()
  })

  it('returns 503 when billing is not configured', async () => {
    const { app } = mount({ provider: null })
    const webhook = await app.request('/billing/webhook', { method: 'POST', body: '{}' })
    expect(webhook.status).toBe(503)
    const checkout = await app.request('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ priceRef: 'price_pro' })
    })
    expect(checkout.status).toBe(503)
  })

  it('rejects a webhook with a bad signature (401) when a secret is set', async () => {
    const store = new MemoryBillingStore()
    const app = new Hono()
    app.route(
      '/billing',
      createBillingRoutes({
        provider: createFakeProvider({ secret: 'whsec' }),
        store,
        requireAuth: authAs('did:key:alice'),
        appUrl: 'https://app.example'
      })
    )
    const bad = await app.request('/billing/webhook', {
      method: 'POST',
      body: sub('did:key:alice'),
      headers: { 'stripe-signature': 't=1,v1=deadbeef' }
    })
    expect(bad.status).toBe(401)
    // A correctly signed delivery is accepted.
    const body = sub('did:key:alice')
    const ok = await app.request('/billing/webhook', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signStripePayload(body, 'whsec', Math.floor(Date.now() / 1000))
      }
    })
    expect(ok.status).toBe(200)
  })

  it('creates a checkout session and returns a redirect URL', async () => {
    const { app } = mount({})
    const res = await app.request('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ priceRef: 'price_pro' })
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.url).toContain('fake_checkout=price_pro')
  })

  it('requires priceRef on checkout', async () => {
    const { app } = mount({})
    const res = await app.request('/billing/checkout', { method: 'POST', body: '{}' })
    expect(res.status).toBe(400)
  })

  it('portal returns 503 when the provider has no customer portal', async () => {
    const { app } = mount({}) // fake provider has no createPortalSession
    const res = await app.request('/billing/portal', { method: 'POST', body: '{}' })
    expect(res.status).toBe(503)
  })

  it('portal 404s without a customer, then returns a URL once one exists', async () => {
    const store = new MemoryBillingStore()
    const provider = {
      ...createFakeProvider(),
      createPortalSession: async () => ({ url: 'https://portal.example/x' })
    }
    const app = new Hono()
    app.route(
      '/billing',
      createBillingRoutes({
        provider,
        store,
        requireAuth: authAs('did:key:alice'),
        appUrl: 'https://app.example'
      })
    )

    const noCustomer = await app.request('/billing/portal', { method: 'POST', body: '{}' })
    expect(noCustomer.status).toBe(404)

    await store.applyMutation({
      kind: 'customer',
      data: {
        id: 'cus_1',
        did: 'did:key:alice',
        provider: 'fake',
        externalRef: 'cus_1',
        updatedAt: 1
      }
    })
    const ok = await app.request('/billing/portal', { method: 'POST', body: '{}' })
    expect(ok.status).toBe(200)
    expect((await ok.json()).url).toBe('https://portal.example/x')
  })
})
