import type { Subscription } from './types'
import { describe, expect, it } from 'vitest'
import { MemoryBillingStore, isActiveSubscription, pickCurrentSubscription } from './store'

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 'sub_1',
  did: 'did:key:alice',
  provider: 'stripe',
  externalRef: 'sub_1',
  status: 'active',
  priceRef: 'price_pro',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  updatedAt: 1,
  ...over
})

describe('isActiveSubscription', () => {
  it('treats active and trialing as active, others not', () => {
    expect(isActiveSubscription(sub({ status: 'active' }))).toBe(true)
    expect(isActiveSubscription(sub({ status: 'trialing' }))).toBe(true)
    expect(isActiveSubscription(sub({ status: 'past_due' }))).toBe(false)
    expect(isActiveSubscription(null)).toBe(false)
  })
})

describe('pickCurrentSubscription', () => {
  it('ranks active over canceled regardless of recency', () => {
    const current = pickCurrentSubscription([
      sub({ id: 'a', status: 'canceled', updatedAt: 100 }),
      sub({ id: 'b', status: 'active', updatedAt: 1 })
    ])
    expect(current?.id).toBe('b')
  })

  it('breaks ties by most-recent updatedAt', () => {
    const current = pickCurrentSubscription([
      sub({ id: 'a', status: 'active', updatedAt: 1 }),
      sub({ id: 'b', status: 'active', updatedAt: 2 })
    ])
    expect(current?.id).toBe('b')
  })

  it('returns null for an empty list', () => {
    expect(pickCurrentSubscription([])).toBeNull()
  })
})

describe('MemoryBillingStore', () => {
  it('dedupes events idempotently', async () => {
    const store = new MemoryBillingStore()
    expect(await store.hasSeenEvent('evt_1')).toBe(false)
    await store.markEventSeen('evt_1')
    expect(await store.hasSeenEvent('evt_1')).toBe(true)
  })

  it('upserts subscriptions last-write-wins by updatedAt', async () => {
    const store = new MemoryBillingStore()
    await store.applyMutation({
      kind: 'subscription',
      data: sub({ status: 'active', updatedAt: 5 })
    })
    // Stale update (older timestamp) must NOT overwrite.
    await store.applyMutation({
      kind: 'subscription',
      data: sub({ status: 'canceled', updatedAt: 2 })
    })
    let state = await store.forDid('did:key:alice')
    expect(state.subscription?.status).toBe('active')
    // Newer update wins.
    await store.applyMutation({
      kind: 'subscription',
      data: sub({ status: 'canceled', updatedAt: 9 })
    })
    state = await store.forDid('did:key:alice')
    expect(state.subscription?.status).toBe('canceled')
  })

  it('scopes reads to the owning DID', async () => {
    const store = new MemoryBillingStore()
    await store.applyMutation({
      kind: 'subscription',
      data: sub({ id: 'a', did: 'did:key:alice' })
    })
    await store.applyMutation({ kind: 'subscription', data: sub({ id: 'b', did: 'did:key:bob' }) })
    const alice = await store.forDid('did:key:alice')
    expect(alice.subscriptions.map((s) => s.id)).toEqual(['a'])
    const bob = await store.forDid('did:key:bob')
    expect(bob.subscriptions.map((s) => s.id)).toEqual(['b'])
  })

  it('backfills DID from the customer-ref map for objects lacking metadata', async () => {
    const store = new MemoryBillingStore()
    await store.applyMutation({
      kind: 'customer',
      data: {
        id: 'cus_1',
        did: 'did:key:alice',
        provider: 'stripe',
        externalRef: 'cus_1',
        updatedAt: 1
      }
    })
    // Invoice arrives with no did, only a customerRef → store resolves it.
    await store.applyMutation({
      kind: 'invoice',
      data: {
        id: 'in_1',
        did: '',
        provider: 'stripe',
        externalRef: 'in_1',
        customerRef: 'cus_1',
        amountDueMinor: 999,
        currency: 'USD',
        status: 'paid',
        updatedAt: 2
      }
    })
    const state = await store.forDid('did:key:alice')
    expect(state.invoices.map((i) => i.id)).toEqual(['in_1'])
    expect(state.customer?.externalRef).toBe('cus_1')
  })

  it('drops mutations that cannot be attributed to any DID', async () => {
    const store = new MemoryBillingStore()
    await store.applyMutation({
      kind: 'payment',
      data: {
        id: 'pi_1',
        did: '',
        provider: 'stripe',
        externalRef: 'pi_1',
        customerRef: 'cus_unknown',
        amountMinor: 500,
        currency: 'USD',
        status: 'succeeded',
        updatedAt: 1
      }
    })
    expect((await store.forDid('did:key:alice')).payments).toEqual([])
  })
})
