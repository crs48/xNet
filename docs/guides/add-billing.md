# Add billing (Stripe or Bitcoin)

xNet ships **plug-and-play billing** as a feature of the open-source hub. Drop two
secrets into the hub, add one hook to your app, and subscriptions/payments stream
into your own store and show up reactively — the same way `useIdentity` exposes
identity ([exploration 0187](../explorations/0187_[x]_PLUG_AND_PLAY_BILLING_STRIPE_AND_BITCOIN.md)).

It is **provider-agnostic**: the same routes and the same `useBilling()` hook work
with **Stripe** (subscriptions + customer portal) or **Bitcoin/Lightning** via a
self-hosted **BTCPay Server** (one-shot payments). The core lives in
[`@xnetjs/billing`](../../packages/billing) (MIT, zero runtime deps); the hub
wires it up; `@xnetjs/react` exposes the hook.

## The security model (read this first)

- The **secret key never goes on the client.** Only the _publishable_ key
  (`pk_…`) is ever client-side, and the default redirect flow doesn't even need
  that — the hub creates checkout sessions with the secret key server-side and
  returns only a redirect URL.
- The hub **stamps the caller's DID** into checkout metadata server-side (never a
  client-supplied id), so settlement webhooks are attributable and every read
  (`GET /billing/me`) is scoped to the caller's own DID.
- Webhooks are **signature-verified** (Stripe `whsec_…` HMAC / BTCPay `BTCPay-Sig`)
  and **idempotent** (deduped by event id), so retries never double-apply.

## 1. Configure the hub (Stripe)

Billing is **opt-in** — with no env set, the routes answer `503` and nothing runs.
Set these on the hub (Railway / Fly / your container), never in client code:

```bash
XNET_BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
```

Then point a Stripe webhook endpoint at the hub:

```
https://your-hub.example.com/billing/webhook
```

Subscribe it to (at least): `checkout.session.completed`,
`customer.subscription.created|updated|deleted`, `invoice.paid`,
`invoice.payment_failed`.

## 2. Add the hook to your app

The client only needs the hub URL it already has:

```tsx
import { XNetProvider, useBilling } from '@xnetjs/react'
;<XNetProvider
  config={
    {
      /* …identity, hubUrl… */
    }
  }
>
  <App />
</XNetProvider>

function Upgrade() {
  const { isActive, plan, loading, openCheckout, openPortal } = useBilling()
  if (loading) return <Spinner />
  return isActive ? (
    <button onClick={() => openPortal?.()}>Manage {plan}</button>
  ) : (
    <button onClick={() => openCheckout('price_pro_monthly')}>Upgrade to Pro</button>
  )
}
```

`useBilling()` fetches the caller's DID-scoped state (`subscription`, `isActive`,
`plan`, `status`, `customer`, `invoices`, `payments`), and `openCheckout()` /
`openPortal()` POST to the hub and redirect to the hosted page. Call `reload()`
after returning from checkout to refresh.

## 3. Bitcoin / Lightning instead (BTCPay)

Bitcoin has no native subscription primitive, so the BTCPay provider emits
one-shot **payments** (a settled invoice = a succeeded payment). Configure the hub
against a self-hosted [BTCPay Server](https://docs.btcpayserver.org/):

```bash
XNET_BILLING_PROVIDER=btcpay
BTCPAY_URL=https://btcpay.example.com
BTCPAY_API_KEY=…
BTCPAY_STORE_ID=…
BTCPAY_WEBHOOK_SECRET=…
```

Register a BTCPay **store webhook** pointing at `/billing/webhook` (event
`InvoiceSettled`). In the client, `openCheckout` takes an amount spec instead of a
plan id, and uses one-shot mode:

```tsx
openCheckout('9.99:USD', { mode: 'payment' }) // BTCPay converts fiat → sats at checkout
```

Settled payments appear in `useBilling().payments`. Model recurring revenue as
repeated payments / a credit balance.

## Local development without keys

The fake provider needs no account, keys, or network — handy for poking the flow
with `curl`:

```bash
XNET_BILLING_PROVIDER=fake
```

It speaks Stripe-shaped events and (optionally) verifies a signature if you set
`BILLING_FAKE_SECRET`.

## How it fits together

- `@xnetjs/billing` — the `PaymentProvider` port, canonical model
  (`Customer`/`Subscription`/`Invoice`/`Payment`, money in integer minor units),
  Stripe + BTCPay + fake adapters, webhook verification, idempotent store.
- The hub — `routes/billing.ts` (`/webhook`, `/checkout`, `/me`, `/portal`) over a
  durable `billing.db`; mounted in `server.ts`; provider resolved from env.
- `@xnetjs/react` — `useBilling()` + optional `XNetConfig.billing`.

This is general subscription/checkout billing for **any** app on xNet. It is
distinct from `@xnetjs/cloud/billing`, which is xNet Cloud's own internal
usage-metering and is FSL-licensed — the open-source path here never depends on it.
