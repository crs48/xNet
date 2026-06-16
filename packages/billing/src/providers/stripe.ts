/**
 * @xnetjs/billing — Stripe provider.
 *
 * No `stripe` SDK dependency: checkout/portal sessions are created with `fetch`
 * against Stripe's form-encoded REST API, and webhooks are verified with a local
 * HMAC (`verifyStripeSignature`). This keeps the hub install light and the package
 * dependency-free. The secret key is used only here, server-side.
 */

import type { CheckoutRequest, CheckoutSession, PaymentProvider, PortalRequest } from '../provider'
import type {
  BillingMutation,
  InvoiceStatus,
  PaymentStatus,
  ProviderEvent,
  Subscription,
  SubscriptionStatus
} from '../types'
import { BillingSignatureError } from '../provider'
import { verifyStripeSignature } from '../stripe-signature'

export interface StripeProviderConfig {
  /** Stripe secret key (`sk_…`). Server-side only. */
  secretKey: string
  /** Webhook endpoint signing secret (`whsec_…`). */
  webhookSecret: string
  /** API base, override for tests. Default `https://api.stripe.com`. */
  apiBase?: string
  /** Injectable fetch for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /** Signature freshness tolerance in seconds (0 disables). */
  signatureToleranceSec?: number
}

type Obj = Record<string, unknown>
const asObj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

const STRIPE_SUB_STATUS: Record<string, SubscriptionStatus> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  unpaid: 'unpaid',
  incomplete: 'incomplete',
  incomplete_expired: 'canceled',
  paused: 'past_due'
}

const STRIPE_INVOICE_STATUS = new Set<InvoiceStatus>([
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible'
])

const STRIPE_PI_STATUS: Record<string, PaymentStatus> = {
  succeeded: 'succeeded',
  processing: 'pending',
  requires_payment_method: 'pending',
  requires_confirmation: 'pending',
  requires_action: 'pending',
  requires_capture: 'pending',
  canceled: 'failed'
}

/** Normalize a verified Stripe event into canonical mutations. Pure + defensive. */
export function normalizeStripeEvent(event: ProviderEvent, now: number): BillingMutation[] {
  const obj = asObj(event.data)
  switch (event.type) {
    case 'checkout.session.completed': {
      const did = str(obj.client_reference_id) ?? str(asObj(obj.metadata).did)
      const customer = str(obj.customer)
      if (!did || !customer) return []
      const email = str(asObj(obj.customer_details).email) ?? str(obj.customer_email)
      return [
        {
          kind: 'customer',
          data: {
            id: customer,
            did,
            provider: 'stripe',
            externalRef: customer,
            ...(email ? { email } : {}),
            updatedAt: now
          }
        }
      ]
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const id = str(obj.id)
      const did = str(asObj(obj.metadata).did)
      if (!id || !did) return []
      const rawStatus = str(obj.status) ?? ''
      const status: SubscriptionStatus =
        event.type === 'customer.subscription.deleted'
          ? 'canceled'
          : (STRIPE_SUB_STATUS[rawStatus] ?? 'incomplete')
      const periodEnd = num(obj.current_period_end)
      const firstItem = asObj((asObj(obj.items).data as unknown[] | undefined)?.[0])
      const priceRef = str(asObj(firstItem.price).id) ?? ''
      const sub: Subscription = {
        id,
        did,
        provider: 'stripe',
        externalRef: id,
        status,
        priceRef,
        currentPeriodEnd: periodEnd ? periodEnd * 1000 : null,
        cancelAtPeriodEnd: obj.cancel_at_period_end === true,
        raw: event.data,
        updatedAt: now
      }
      return [{ kind: 'subscription', data: sub }]
    }

    case 'invoice.paid':
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed':
    case 'invoice.finalized': {
      const id = str(obj.id)
      const customer = str(obj.customer)
      if (!id) return []
      const rawStatus = str(obj.status) as InvoiceStatus | undefined
      const status: InvoiceStatus =
        rawStatus && STRIPE_INVOICE_STATUS.has(rawStatus) ? rawStatus : 'open'
      return [
        {
          kind: 'invoice',
          data: {
            id,
            did: str(asObj(obj.metadata).did) ?? '',
            provider: 'stripe',
            externalRef: id,
            ...(customer ? { customerRef: customer } : {}),
            amountDueMinor: num(obj.amount_due) ?? 0,
            currency: (str(obj.currency) ?? 'usd').toUpperCase(),
            status,
            ...(str(obj.hosted_invoice_url) ? { hostedUrl: str(obj.hosted_invoice_url) } : {}),
            raw: event.data,
            updatedAt: now
          }
        }
      ]
    }

    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
    case 'payment_intent.processing': {
      const id = str(obj.id)
      const customer = str(obj.customer)
      if (!id) return []
      const status = STRIPE_PI_STATUS[str(obj.status) ?? ''] ?? 'pending'
      return [
        {
          kind: 'payment',
          data: {
            id,
            did: str(asObj(obj.metadata).did) ?? '',
            provider: 'stripe',
            externalRef: id,
            ...(customer ? { customerRef: customer } : {}),
            amountMinor: num(obj.amount) ?? 0,
            currency: (str(obj.currency) ?? 'usd').toUpperCase(),
            status,
            raw: event.data,
            updatedAt: now
          }
        }
      ]
    }

    default:
      return []
  }
}

export function createStripeProvider(config: StripeProviderConfig): PaymentProvider {
  const apiBase = config.apiBase ?? 'https://api.stripe.com'
  const doFetch = config.fetchImpl ?? fetch

  const post = async (path: string, form: URLSearchParams): Promise<Obj> => {
    const res = await doFetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`Stripe ${path} failed: ${res.status} ${text}`)
    return asObj(JSON.parse(text))
  }

  return {
    id: 'stripe',

    async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
      const form = new URLSearchParams()
      form.set('mode', req.mode)
      form.set('success_url', req.successUrl)
      form.set('cancel_url', req.cancelUrl)
      form.set('line_items[0][price]', req.priceRef)
      form.set('line_items[0][quantity]', '1')
      // Bind the DID server-side and propagate it onto the resulting object so
      // webhooks are attributable. Never trust a client-supplied customer id.
      form.set('client_reference_id', req.did)
      form.set('metadata[did]', req.did)
      if (req.mode === 'subscription') form.set('subscription_data[metadata][did]', req.did)
      else form.set('payment_intent_data[metadata][did]', req.did)
      if (req.customerEmail) form.set('customer_email', req.customerEmail)

      const json = await post('/v1/checkout/sessions', form)
      const url = str(json.url)
      const id = str(json.id)
      if (!url || !id) throw new Error('Stripe checkout session missing url/id')
      return { url, externalRef: id }
    },

    async parseWebhook(rawBody, headers): Promise<ProviderEvent> {
      const signature = headers['stripe-signature'] ?? headers['Stripe-Signature']
      if (
        !verifyStripeSignature(rawBody, signature, config.webhookSecret, {
          toleranceSec: config.signatureToleranceSec
        })
      ) {
        throw new BillingSignatureError('Invalid Stripe webhook signature')
      }
      const event = asObj(JSON.parse(rawBody))
      const id = str(event.id)
      const type = str(event.type)
      if (!id || !type) throw new Error('Malformed Stripe event')
      return { id, type, provider: 'stripe', data: asObj(event.data).object }
    },

    normalize(event: ProviderEvent): BillingMutation[] {
      return normalizeStripeEvent(event, Date.now())
    },

    async createPortalSession(req: PortalRequest): Promise<{ url: string }> {
      const form = new URLSearchParams()
      form.set('customer', req.customerExternalRef)
      form.set('return_url', req.returnUrl)
      const json = await post('/v1/billing_portal/sessions', form)
      const url = str(json.url)
      if (!url) throw new Error('Stripe portal session missing url')
      return { url }
    }
  }
}
