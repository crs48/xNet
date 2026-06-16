import { describe, expect, it } from 'vitest'
import { BillingSignatureError } from './provider'
import { createStripeProvider } from './providers/stripe'
import { MemoryBillingStore } from './store'
import { signStripePayload } from './stripe-signature'
import { processWebhook } from './webhook'

const SECRET = 'whsec_test'
const DID = 'did:key:alice'

const provider = createStripeProvider({
  secretKey: 'sk_test',
  webhookSecret: SECRET,
  signatureToleranceSec: 0 // deterministic: skip clock-dependent freshness
})

function delivery(event: unknown): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(event)
  return { body, headers: { 'stripe-signature': signStripePayload(body, SECRET, 1) } }
}

describe('processWebhook (Stripe, real signature path)', () => {
  it('verifies → normalizes → applies, end to end', async () => {
    const store = new MemoryBillingStore()

    const checkout = delivery({
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: DID, customer: 'cus_1', customer_email: 'a@x.io' } }
    })
    const r1 = await processWebhook(provider, store, checkout.body, checkout.headers)
    expect(r1).toMatchObject({ received: true, duplicate: false, mutations: 1 })

    const sub = delivery({
      id: 'evt_sub',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          metadata: { did: DID },
          current_period_end: 1_700_000_000,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_pro' } }] }
        }
      }
    })
    await processWebhook(provider, store, sub.body, sub.headers)

    const state = await store.forDid(DID)
    expect(state.customer?.externalRef).toBe('cus_1')
    expect(state.subscription?.status).toBe('active')
    expect(state.subscription?.priceRef).toBe('price_pro')
    expect(state.subscription?.currentPeriodEnd).toBe(1_700_000_000 * 1000)
  })

  it('is idempotent on redelivered event ids', async () => {
    const store = new MemoryBillingStore()
    const sub = delivery({
      id: 'evt_sub',
      type: 'customer.subscription.created',
      data: {
        object: { id: 'sub_1', status: 'active', metadata: { did: DID }, items: { data: [] } }
      }
    })
    const first = await processWebhook(provider, store, sub.body, sub.headers)
    const second = await processWebhook(provider, store, sub.body, sub.headers)
    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.mutations).toBe(0)
  })

  it('throws BillingSignatureError on a bad signature (→ HTTP 401)', async () => {
    const store = new MemoryBillingStore()
    const body = JSON.stringify({ id: 'evt_x', type: 'customer.subscription.created', data: {} })
    await expect(
      processWebhook(provider, store, body, { 'stripe-signature': 't=1,v1=deadbeef' })
    ).rejects.toBeInstanceOf(BillingSignatureError)
  })
})
