import { describe, expect, it } from 'vitest'
import { billingProviderFromEnv } from './config'

describe('billingProviderFromEnv', () => {
  it('returns null when nothing is configured', () => {
    expect(billingProviderFromEnv({})).toBeNull()
  })

  it('resolves Stripe from keys', () => {
    const p = billingProviderFromEnv({
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec'
    })
    expect(p?.id).toBe('stripe')
  })

  it('returns null when Stripe is half-configured', () => {
    expect(billingProviderFromEnv({ STRIPE_SECRET_KEY: 'sk_test' })).toBeNull()
    expect(
      billingProviderFromEnv({ XNET_BILLING_PROVIDER: 'stripe', STRIPE_WEBHOOK_SECRET: 'whsec' })
    ).toBeNull()
  })

  it('resolves BTCPay when fully configured', () => {
    const p = billingProviderFromEnv({
      XNET_BILLING_PROVIDER: 'btcpay',
      BTCPAY_URL: 'https://btcpay.example.com',
      BTCPAY_API_KEY: 'k',
      BTCPAY_STORE_ID: 's',
      BTCPAY_WEBHOOK_SECRET: 'whsec'
    })
    expect(p?.id).toBe('btcpay')
  })

  it('infers BTCPay from BTCPAY_URL when no provider is named', () => {
    const p = billingProviderFromEnv({
      BTCPAY_URL: 'https://btcpay.example.com',
      BTCPAY_API_KEY: 'k',
      BTCPAY_STORE_ID: 's',
      BTCPAY_WEBHOOK_SECRET: 'whsec'
    })
    expect(p?.id).toBe('btcpay')
  })

  it('resolves the fake provider on request', () => {
    expect(billingProviderFromEnv({ XNET_BILLING_PROVIDER: 'fake' })?.id).toBe('fake')
  })
})
