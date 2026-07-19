# @xnetjs/billing

Plug-and-play, **provider-agnostic billing** for the self-hostable xNet hub —
Stripe **and** Bitcoin (BTCPay / Lightning) behind one `PaymentProvider` port,
with a canonical billing model, webhook verification, and an idempotent billing
store. See [exploration 0187](../../docs/explorations/0187_%5B_%5D_PLUG_AND_PLAY_BILLING_STRIPE_AND_BITCOIN.md).

> **Alpha software.** xNet is released but early: this package is on npm and
> usable today, but its API can change between releases, sometimes without a
> migration path. Pin your version. See the
> [project README](https://github.com/crs48/xNet#readme) for what alpha means here.

**Zero runtime dependencies.** Webhook signatures are verified with `node:crypto`
HMAC; checkout/portal sessions are created with `fetch` against the providers'
REST APIs. No `stripe` SDK, no `@aws-sdk` — so the MIT hub can import this
without taking an FSL dependency on `@xnetjs/cloud`. (This package is _general_
subscription/checkout billing for any app; `@xnetjs/cloud/billing` is xNet
Cloud's own _usage-metering_ — they are complementary.)

## What it gives you

- **`PaymentProvider` port** — `createCheckout`, `parseWebhook` (verifies the
  signature), `normalize` (event → canonical mutations), optional
  `createPortalSession`.
- **Adapters** — `createStripeProvider`, `createBtcpayProvider`,
  `createFakeProvider` (keyless local dev / tests).
- **Canonical model** — `Customer`, `Subscription`, `Invoice`, `Payment`. Money
  is always integer **minor units** (cents / sats).
- **`BillingStore`** — `MemoryBillingStore` here; the hub adds a durable SQLite
  one. Reads are DID-scoped; event ids are deduped (idempotency).
- **`processWebhook`** — verify → dedupe → normalize → apply, in one call.
- **`billingProviderFromEnv`** — resolve the provider from env, or `null` when
  billing is not configured.

## Security model

- The **secret key never leaves the server.** Only the _publishable_ key
  (`pk_…`) is client-side. The hub creates checkout sessions with the secret key
  and returns only the redirect URL.
- The **DID is bound server-side** into checkout metadata — never trusted from a
  client body — so settlement webhooks are attributable, and reads stay scoped to
  the caller's own DID.

## Stripe vs Bitcoin

Stripe has native recurring `Subscription`s and a hosted customer portal. Bitcoin
(BTCPay/Lightning) has **no native subscription** — it emits one-shot `Payment`s
(a settled invoice). The model carries both so `useBilling()` works on either
rail; recurring Bitcoin is modeled as repeated payments / credits.
