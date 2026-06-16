import type { Subscription } from '@xnetjs/billing'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteBillingStore } from './billing-store'

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

describe('SqliteBillingStore', () => {
  let dir: string
  let store: SqliteBillingStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xnet-billing-'))
    store = new SqliteBillingStore(dir)
  })
  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('dedupes events idempotently', async () => {
    expect(await store.hasSeenEvent('evt_1')).toBe(false)
    await store.markEventSeen('evt_1')
    await store.markEventSeen('evt_1') // INSERT OR IGNORE — no throw
    expect(await store.hasSeenEvent('evt_1')).toBe(true)
  })

  it('upserts last-write-wins and scopes reads by DID', async () => {
    await store.applyMutation({
      kind: 'subscription',
      data: sub({ status: 'active', updatedAt: 5 })
    })
    await store.applyMutation({
      kind: 'subscription',
      data: sub({ status: 'canceled', updatedAt: 2 })
    }) // stale
    expect((await store.forDid('did:key:alice')).subscription?.status).toBe('active')
    await store.applyMutation({
      kind: 'subscription',
      data: sub({ status: 'canceled', updatedAt: 9 })
    })
    expect((await store.forDid('did:key:alice')).subscription?.status).toBe('canceled')

    await store.applyMutation({
      kind: 'subscription',
      data: sub({ id: 'sub_bob', did: 'did:key:bob' })
    })
    expect((await store.forDid('did:key:alice')).subscriptions.map((s) => s.id)).toEqual(['sub_1'])
    expect((await store.forDid('did:key:bob')).subscriptions.map((s) => s.id)).toEqual(['sub_bob'])
  })

  it('resolves DID from the customer ref for objects lacking metadata', async () => {
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
    expect(await store.didForCustomerRef('cus_1')).toBe('did:key:alice')
    await store.applyMutation({
      kind: 'invoice',
      data: {
        id: 'in_1',
        did: '',
        provider: 'stripe',
        externalRef: 'in_1',
        customerRef: 'cus_1',
        amountDueMinor: 1999,
        currency: 'USD',
        status: 'paid',
        hostedUrl: 'https://pay/x',
        updatedAt: 2
      }
    })
    await store.applyMutation({
      kind: 'payment',
      data: {
        id: 'pi_1',
        did: 'did:key:alice',
        provider: 'btcpay',
        externalRef: 'pi_1',
        amountMinor: 2100,
        currency: 'USD',
        status: 'succeeded',
        updatedAt: 3
      }
    })
    const state = await store.forDid('did:key:alice')
    expect(state.customer?.externalRef).toBe('cus_1')
    expect(state.invoices.map((i) => i.id)).toEqual(['in_1'])
    expect(state.invoices[0].hostedUrl).toBe('https://pay/x')
    expect(state.payments.map((p) => p.amountMinor)).toEqual([2100])
  })

  it('buffers an unattributed payment and replays it once the customer maps (out-of-order)', async () => {
    // Settlement webhook arrives BEFORE checkout creates the mapping.
    await store.applyMutation({
      kind: 'payment',
      data: {
        id: 'pi_x',
        did: '',
        provider: 'stripe',
        externalRef: 'pi_x',
        customerRef: 'cus_1',
        amountMinor: 700,
        currency: 'USD',
        status: 'succeeded',
        updatedAt: 1
      }
    })
    expect((await store.forDid('did:key:alice')).payments).toEqual([]) // held, not lost

    await store.applyMutation({
      kind: 'customer',
      data: {
        id: 'cus_1',
        did: 'did:key:alice',
        provider: 'stripe',
        externalRef: 'cus_1',
        updatedAt: 2
      }
    })
    expect((await store.forDid('did:key:alice')).payments.map((p) => p.id)).toEqual(['pi_x'])
  })

  it('refuses to backfill an ambiguous customer ref shared by two DIDs', async () => {
    for (const did of ['did:key:alice', 'did:key:bob']) {
      await store.applyMutation({
        kind: 'customer',
        data: { id: did, did, provider: 'stripe', externalRef: 'cus_shared', updatedAt: 1 }
      })
    }
    // Ambiguous → no backfill, so the invoice is held rather than misattributed.
    expect(await store.didForCustomerRef('cus_shared')).toBeNull()
    await store.applyMutation({
      kind: 'invoice',
      data: {
        id: 'in_amb',
        did: '',
        provider: 'stripe',
        externalRef: 'in_amb',
        customerRef: 'cus_shared',
        amountDueMinor: 1,
        currency: 'USD',
        status: 'open',
        updatedAt: 2
      }
    })
    expect((await store.forDid('did:key:alice')).invoices).toEqual([])
    expect((await store.forDid('did:key:bob')).invoices).toEqual([])
  })

  it('persists across reopen (durability)', async () => {
    await store.applyMutation({
      kind: 'subscription',
      data: sub({ status: 'active', raw: { x: 1 } })
    })
    await store.markEventSeen('evt_persist')
    store.close()

    const reopened = new SqliteBillingStore(dir)
    try {
      const state = await reopened.forDid('did:key:alice')
      expect(state.subscription?.status).toBe('active')
      expect(state.subscription?.raw).toEqual({ x: 1 })
      expect(await reopened.hasSeenEvent('evt_persist')).toBe(true)
    } finally {
      reopened.close()
    }
  })
})
