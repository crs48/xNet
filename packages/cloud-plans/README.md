# @xnetjs/cloud-plans

The plan/entitlement contract shared by the xNet Cloud control plane and the hubs it provisions. See explorations 0174 (open-core control plane) and 0175 (deployment + capacity-as-entitlement-flips).

This package is pure (no I/O) so both the control plane and a running hub can agree on what a tenant is entitled to. Capacity changes are entitlement flips, not redeploys.

## Features

- **Plan catalog** -- `PLAN_CATALOG` / `PLAN_ORDER`: the managed-hosting tiers and their isolation/SLA levels
- **Entitlement resolution** -- `resolveEntitlements` plus `withStorage` / `withSeats` / `withConcurrency` overrides, and `requiresMigration` to detect tier changes that need a substrate move
- **Signed entitlements** -- `signEntitlements` / `verifyEntitlements` / `entitlementsFromEnv`: a hub reads a signed entitlement token instead of calling home
- **Cost model** -- `UNIT_COSTS`, `estimateCogs`, `PLAN_PRICING`: pure COGS/margin math per plan

## Usage

```typescript
import { resolveEntitlements, asPlanId, signEntitlements } from '@xnetjs/cloud-plans'

const entitlements = resolveEntitlements(asPlanId('starter'))

// Issue a signed token a provisioned hub can verify offline
const token = await signEntitlements(entitlements, signingKey)
```

## Modules

| Module            | Description                                        |
| ----------------- | -------------------------------------------------- |
| `plans.ts`        | Plan catalog, entitlement resolution, overrides    |
| `entitlements.ts` | Sign / verify / env-load signed entitlement tokens |
| `pricing.ts`      | Unit costs, COGS estimation, per-plan pricing      |

## Testing

```bash
pnpm --filter @xnetjs/cloud-plans test
```
