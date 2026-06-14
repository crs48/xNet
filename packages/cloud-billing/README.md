# @xnetjs/cloud-billing

Usage metering and Stripe billing for the managed fleet. See explorations 0175/0176.

Three layers, each independently testable: **pure pricing math**, an **idempotent usage ledger**, and a **Stripe meter/webhook adapter** with an in-memory fake so the whole stack runs with no Stripe keys.

## Features

- **Pricing** -- `computeChargeUsd` / `computeProviderCostUsd` and the `TokenPricing` type: pure functions, no I/O
- **Ledger** -- `MemoryUsageLedger` implementing the `UsageLedger` interface; idempotent so a replayed `UsageEntry` is charged once
- **Stripe billing** -- `StripeBillingAdapter` (meter events + webhook verification via `verifyWebhook`) and `FakeStripeBilling` for keyless testing

## Usage

```typescript
import { computeChargeUsd, MemoryUsageLedger, FakeStripeBilling } from '@xnetjs/cloud-billing'

const ledger = new MemoryUsageLedger()
const billing = new FakeStripeBilling()

const charge = computeChargeUsd(usage, pricing)
await ledger.record({ tenantId, idempotencyKey, charge })
await billing.meter({ tenantId, value: charge })
```

## Modules

| Module       | Description                                   |
| ------------ | --------------------------------------------- |
| `pricing.ts` | Pure charge / provider-cost math              |
| `ledger.ts`  | Idempotent usage ledger (`MemoryUsageLedger`) |
| `billing.ts` | Stripe meter/webhook adapter + in-memory fake |

## Testing

```bash
pnpm --filter @xnetjs/cloud-billing test
```

Tests run with no Stripe keys via `FakeStripeBilling`.
