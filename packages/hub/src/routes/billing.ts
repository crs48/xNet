/**
 * @xnetjs/hub - Billing routes (Stripe + Bitcoin via @xnetjs/billing).
 *
 * Transport-only shell over the provider-agnostic `@xnetjs/billing` core:
 *  - POST /billing/webhook   unauthenticated; verified by the provider signature,
 *                            then streamed into the billing store (verify → dedupe
 *                            → normalize → apply).
 *  - POST /billing/checkout  authed; creates a hosted checkout with the secret key
 *                            server-side and returns only the redirect URL. The DID
 *                            is taken from the session — never a client body.
 *  - GET  /billing/me        authed; the caller's own DID-scoped billing state.
 *  - POST /billing/portal    authed; Stripe customer-portal URL (when supported).
 *
 * When no provider is configured the money routes answer 503 — billing is opt-in.
 */

import type { AuthContext } from '../auth/ucan'
import type { Context, MiddlewareHandler } from 'hono'
import {
  BillingSignatureError,
  processWebhook,
  type BillingStore,
  type PaymentProvider
} from '@xnetjs/billing'
import { Hono } from 'hono'
import { isRecord } from '../utils/validation'

type Env = { Variables: { auth: AuthContext } }

export interface BillingRoutesOptions {
  /** The configured payment provider, or null when billing is not set up. */
  provider: PaymentProvider | null
  /** Durable billing store (DID-scoped reads + idempotent event dedup). */
  store: BillingStore
  /** Auth middleware injected by the server; applied to the money routes. */
  requireAuth?: MiddlewareHandler
  /** Web app base URL used as the default checkout success/cancel target. */
  appUrl: string
}

const notConfigured = (c: Context) =>
  c.json({ error: 'Billing is not configured', code: 'NOT_CONFIGURED' }, 503)

export const createBillingRoutes = (options: BillingRoutesOptions): Hono<Env> => {
  const app = new Hono<Env>()
  const { provider, store, requireAuth, appUrl } = options

  // Gate only the money/read routes (the webhook stays unauthenticated — it is
  // verified by the provider signature). Same `app.use(path, requireAuth)` shape
  // the server uses for /backup and /files.
  if (requireAuth) {
    app.use('/checkout', requireAuth)
    app.use('/me', requireAuth)
    app.use('/portal', requireAuth)
  }

  // ── Webhook ── unauthenticated; the provider signature is the credential.
  app.post('/webhook', async (c) => {
    if (!provider) return notConfigured(c)
    const rawBody = await c.req.text()
    const headers = c.req.header() as Record<string, string>
    try {
      const result = await processWebhook(provider, store, rawBody, headers)
      return c.json(result)
    } catch (err) {
      if (err instanceof BillingSignatureError) {
        return c.json({ error: err.message, code: 'INVALID_SIGNATURE' }, 401)
      }
      throw err
    }
  })

  // ── Checkout ── authed; secret-key call happens server-side.
  app.post('/checkout', async (c) => {
    if (!provider) return notConfigured(c)
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth) return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    const body = await c.req.json().catch(() => null)
    if (!isRecord(body) || typeof body.priceRef !== 'string') {
      return c.json({ error: 'priceRef is required', code: 'INVALID_INPUT' }, 400)
    }
    const session = await provider.createCheckout({
      did: auth.did, // server-trusted; never a client-supplied customer id
      priceRef: body.priceRef,
      mode: body.mode === 'payment' ? 'payment' : 'subscription',
      successUrl: typeof body.successUrl === 'string' ? body.successUrl : appUrl,
      cancelUrl: typeof body.cancelUrl === 'string' ? body.cancelUrl : appUrl,
      ...(typeof body.customerEmail === 'string' ? { customerEmail: body.customerEmail } : {})
    })
    return c.json(session)
  })

  // ── Me ── authed; the caller only ever sees their own billing.
  app.get('/me', async (c) => {
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth) return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    return c.json(await store.forDid(auth.did))
  })

  // ── Portal ── authed; manage an existing subscription (Stripe).
  app.post('/portal', async (c) => {
    if (!provider?.createPortalSession) return notConfigured(c)
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth) return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    const state = await store.forDid(auth.did)
    const customerRef = state.customer?.externalRef
    if (!customerRef) {
      return c.json({ error: 'No billing customer for this identity', code: 'NO_CUSTOMER' }, 404)
    }
    const body = await c.req.json().catch(() => null)
    const returnUrl = isRecord(body) && typeof body.returnUrl === 'string' ? body.returnUrl : appUrl
    const session = await provider.createPortalSession({
      customerExternalRef: customerRef,
      returnUrl
    })
    return c.json(session)
  })

  return app
}
