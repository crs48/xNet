import type { Subscription } from '@xnetjs/billing'
import { describe, expect, it } from 'vitest'
import { entitlementsForSubscription, parsePricePlans } from './billing-entitlements'

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

describe('parsePricePlans', () => {
  it('parses a JSON price→plan map', () => {
    expect(parsePricePlans('{"price_pro":"team","price_ent":"enterprise"}')).toEqual({
      price_pro: 'team',
      price_ent: 'enterprise'
    })
  })

  it('tolerates absence and garbage, dropping non-string values', () => {
    expect(parsePricePlans(undefined)).toEqual({})
    expect(parsePricePlans('not json')).toEqual({})
    expect(parsePricePlans('[1,2]')).toEqual({})
    expect(parsePricePlans('{"a":"team","b":5}')).toEqual({ a: 'team' })
  })
})

describe('entitlementsForSubscription', () => {
  const map = { price_pro: 'team' }

  it('resolves an active mapped subscription to its plan entitlements', () => {
    const ent = entitlementsForSubscription(sub({ status: 'active' }), map)
    expect(ent?.plan).toBe('team')
  })

  it('resolves a trialing subscription too', () => {
    expect(entitlementsForSubscription(sub({ status: 'trialing' }), map)?.plan).toBe('team')
  })

  it('returns null for an inactive subscription', () => {
    expect(entitlementsForSubscription(sub({ status: 'past_due' }), map)).toBeNull()
    expect(entitlementsForSubscription(sub({ status: 'canceled' }), map)).toBeNull()
  })

  it('returns null when there is no subscription', () => {
    expect(entitlementsForSubscription(null, map)).toBeNull()
  })

  it('returns null when the price is not in the map', () => {
    expect(entitlementsForSubscription(sub({ priceRef: 'price_unknown' }), map)).toBeNull()
  })

  it('returns null when the mapped plan id is invalid', () => {
    expect(
      entitlementsForSubscription(sub({ priceRef: 'price_pro' }), { price_pro: 'bogus' })
    ).toBeNull()
  })
})
