import type { ProviderEvent } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { MemoryBillingStore } from '../store'
import { processWebhook } from '../webhook'
import {
  createBtcpayProvider,
  normalizeBtcpayEvent,
  signBtcpayPayload,
  verifyBtcpaySignature
} from './btcpay'

const SECRET = 'btcpay_whsec'
const NOW = 1_000

describe('verifyBtcpaySignature', () => {
  it('accepts a valid sha256= signature and rejects tampering', () => {
    const body = JSON.stringify({ type: 'InvoiceSettled', invoiceId: 'inv_1' })
    const header = signBtcpayPayload(body, SECRET)
    expect(header.startsWith('sha256=')).toBe(true)
    expect(verifyBtcpaySignature(body, header, SECRET)).toBe(true)
    expect(verifyBtcpaySignature(body + 'x', header, SECRET)).toBe(false)
    expect(verifyBtcpaySignature(body, header, 'wrong')).toBe(false)
    expect(verifyBtcpaySignature(body, undefined, SECRET)).toBe(false)
  })
})

describe('normalizeBtcpayEvent', () => {
  const settled = (over: Record<string, unknown> = {}): ProviderEvent => ({
    id: 'del_1',
    type: 'InvoiceSettled',
    provider: 'btcpay',
    data: {
      invoiceId: 'inv_1',
      metadata: { did: 'did:key:alice', amountMinor: 1500, currency: 'USD' },
      ...over
    }
  })

  it('maps a settled invoice → succeeded payment from echoed metadata', () => {
    const [m] = normalizeBtcpayEvent(settled(), NOW)
    expect(m).toEqual({
      kind: 'payment',
      data: {
        id: 'inv_1',
        did: 'did:key:alice',
        provider: 'btcpay',
        externalRef: 'inv_1',
        amountMinor: 1500,
        currency: 'USD',
        status: 'succeeded',
        raw: settled().data,
        updatedAt: NOW
      }
    })
  })

  it('maps processing → pending and expired → failed', () => {
    expect(
      normalizeBtcpayEvent({ ...settled(), type: 'InvoiceProcessing' }, NOW)[0].data
    ).toMatchObject({ status: 'pending' })
    expect(
      normalizeBtcpayEvent({ ...settled(), type: 'InvoiceExpired' }, NOW)[0].data
    ).toMatchObject({
      status: 'failed'
    })
  })

  it('ignores unrelated event types', () => {
    expect(normalizeBtcpayEvent({ ...settled(), type: 'InvoiceCreatedFoo' }, NOW)).toEqual([])
  })
})

describe('BTCPay end-to-end through processWebhook', () => {
  it('settles a Lightning invoice into a DID-scoped payment', async () => {
    const provider = createBtcpayProvider({
      url: 'https://btcpay.example.com',
      apiKey: 'k',
      storeId: 's',
      webhookSecret: SECRET
    })
    const store = new MemoryBillingStore()
    const body = JSON.stringify({
      deliveryId: 'del_1',
      type: 'InvoiceSettled',
      invoiceId: 'inv_1',
      metadata: { did: 'did:key:alice', amountMinor: 2100, currency: 'USD' }
    })
    const result = await processWebhook(provider, store, body, {
      'btcpay-sig': signBtcpayPayload(body, SECRET)
    })
    expect(result).toMatchObject({ duplicate: false, mutations: 1 })
    const state = await store.forDid('did:key:alice')
    expect(state.payments.map((p) => p.amountMinor)).toEqual([2100])
  })
})

describe('createBtcpayProvider.createCheckout', () => {
  it('creates a Greenfield invoice and echoes did/amount into metadata', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: 'inv_1', checkoutLink: 'https://btcpay/i/inv_1' }), {
          status: 200
        })
    )
    const provider = createBtcpayProvider({
      url: 'https://btcpay.example.com/',
      apiKey: 'k',
      storeId: 'store_1',
      webhookSecret: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    const session = await provider.createCheckout({
      did: 'did:key:alice',
      priceRef: '9.99:USD',
      mode: 'payment',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/cancel'
    })
    expect(session).toEqual({ url: 'https://btcpay/i/inv_1', externalRef: 'inv_1' })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://btcpay.example.com/api/v1/stores/store_1/invoices')
    const payload = JSON.parse(String((init as RequestInit).body))
    expect(payload).toMatchObject({
      amount: '9.99',
      currency: 'USD',
      metadata: { did: 'did:key:alice', amountMinor: 999, currency: 'USD' }
    })
  })
})
