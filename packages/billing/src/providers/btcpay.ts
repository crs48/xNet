/**
 * @xnetjs/billing — BTCPay Server (Bitcoin / Lightning) provider.
 *
 * Self-hosted, no-KYC, zero-fee Bitcoin via BTCPay's Greenfield REST API. Bitcoin
 * has no native subscription primitive, so this provider emits one-shot `Payment`s
 * (a settled invoice = a succeeded payment) rather than `Subscription`s — the
 * honest multi-rail shape from exploration 0187.
 *
 * Webhooks are signed `BTCPay-Sig: sha256=<hmac>` over the raw body with the
 * store webhook secret. We echo `{ did, amountMinor, currency }` through the
 * invoice metadata at creation so the settlement webhook is self-describing and
 * `normalize` stays pure (no callback fetch).
 */

import type { CheckoutRequest, CheckoutSession, PaymentProvider } from '../provider'
import type { BillingMutation, PaymentStatus, ProviderEvent } from '../types'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { BillingSignatureError } from '../provider'

export interface BtcpayProviderConfig {
  /** BTCPay Server base URL, e.g. `https://btcpay.example.com`. */
  url: string
  /** Greenfield API key (`Authorization: token <key>`). */
  apiKey: string
  /** Store id to create invoices under. */
  storeId: string
  /** Store webhook secret used to sign `BTCPay-Sig`. */
  webhookSecret: string
  /** Default fiat currency when a price spec omits one. Default `USD`. */
  defaultCurrency?: string
  fetchImpl?: typeof fetch
}

type Obj = Record<string, unknown>
const asObj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined =>
  typeof v === 'number'
    ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      ? Number(v)
      : undefined

const SETTLED = new Set(['InvoiceSettled', 'InvoicePaymentSettled'])
const PENDING = new Set(['InvoiceProcessing', 'InvoiceReceivedPayment', 'InvoiceCreated'])
const FAILED = new Set(['InvoiceExpired', 'InvoiceInvalid'])

function btcpayStatus(type: string): PaymentStatus | null {
  if (SETTLED.has(type)) return 'succeeded'
  if (PENDING.has(type)) return 'pending'
  if (FAILED.has(type)) return 'failed'
  return null
}

/** Verify a `BTCPay-Sig: sha256=<hex>` header against the raw body. */
export function verifyBtcpaySignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false
  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex')
  const provided = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader
  let providedBuf: Buffer
  let expectedBuf: Buffer
  try {
    providedBuf = Buffer.from(provided, 'hex')
    expectedBuf = Buffer.from(expectedHex, 'hex')
  } catch {
    return false
  }
  return providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf)
}

/** Sign a BTCPay payload (tests / fake deliveries). */
export function signBtcpayPayload(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
}

/** Normalize a verified BTCPay webhook event into a canonical Payment mutation. */
export function normalizeBtcpayEvent(event: ProviderEvent, now: number): BillingMutation[] {
  const obj = asObj(event.data)
  const status = btcpayStatus(event.type)
  const invoiceId = str(obj.invoiceId)
  if (!status || !invoiceId) return []
  const metadata = asObj(obj.metadata)
  const did = str(metadata.did) ?? ''
  return [
    {
      kind: 'payment',
      data: {
        id: invoiceId,
        did,
        provider: 'btcpay',
        externalRef: invoiceId,
        amountMinor: num(metadata.amountMinor) ?? 0,
        currency: str(metadata.currency) ?? 'BTC',
        status,
        raw: event.data,
        updatedAt: now
      }
    }
  ]
}

export function createBtcpayProvider(config: BtcpayProviderConfig): PaymentProvider {
  const base = config.url.replace(/\/$/, '')
  const doFetch = config.fetchImpl ?? fetch
  const defaultCurrency = config.defaultCurrency ?? 'USD'

  return {
    id: 'btcpay',

    async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
      // priceRef is "amount" or "amount:CURRENCY" (Bitcoin has no plan ids).
      const [amountPart, currencyPart] = req.priceRef.split(':')
      const amount = amountPart?.trim() || '0'
      const currency = (currencyPart?.trim() || defaultCurrency).toUpperCase()
      const amountMinor = Math.round(Number(amount) * 100)

      const res = await doFetch(`${base}/api/v1/stores/${config.storeId}/invoices`, {
        method: 'POST',
        headers: {
          authorization: `token ${config.apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          amount,
          currency,
          // Echoed back on the settlement webhook so `normalize` stays pure.
          metadata: { did: req.did, amountMinor, currency },
          checkout: { redirectURL: req.successUrl }
        })
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`BTCPay invoice create failed: ${res.status} ${text}`)
      const json = asObj(JSON.parse(text))
      const url = str(json.checkoutLink)
      const id = str(json.id)
      if (!url || !id) throw new Error('BTCPay invoice missing checkoutLink/id')
      return { url, externalRef: id }
    },

    async parseWebhook(rawBody, headers): Promise<ProviderEvent> {
      const signature = headers['btcpay-sig'] ?? headers['BTCPay-Sig']
      if (!verifyBtcpaySignature(rawBody, signature, config.webhookSecret)) {
        throw new BillingSignatureError('Invalid BTCPay webhook signature')
      }
      const event = asObj(JSON.parse(rawBody))
      const type = str(event.type)
      const deliveryId = str(event.deliveryId) ?? str(event.invoiceId)
      if (!type || !deliveryId) throw new Error('Malformed BTCPay event')
      return { id: deliveryId, type, provider: 'btcpay', data: event }
    },

    normalize(event: ProviderEvent): BillingMutation[] {
      return normalizeBtcpayEvent(event, Date.now())
    }
  }
}
