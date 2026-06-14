# @xnetjs/entitlements

The plan/entitlement **contract** shared by both planes of xNet:

- the self-hostable **hub** (`@xnetjs/hub`), which verifies its signed `HUB_PLAN`
  token at boot and enforces the limits locally, and
- the **xNet Cloud control plane** (`@xnetjs/cloud`), which resolves and signs a
  tenant's entitlements.

It lives **outside** `@xnetjs/cloud` on purpose (exploration 0181): the MIT,
self-hostable hub must be able to read and verify entitlements **without** taking
a dependency on the server-only cloud package (and its `stripe` / `@aws-sdk`
dependencies) or on the FSL license. That single cross-plane consumption is the
reason the cloud is two packages, not one.

This package is therefore **MIT-licensed** like the rest of the adoption engine.
The signing _secret_ is the protection, not the verify code — so publishing the
HMAC sign/verify is safe.

## What's here

| Module             | Exports                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `plans.ts`         | `PLAN_CATALOG`, `PLAN_ORDER`, `resolveEntitlements`, `withStorage/Seats/Concurrency`, `requiresMigration`, `asPlanId`, and the `PlanId` / `IsolationTier` / `SlaLevel` / `PlanEntitlements` types |
| `entitlements.ts`  | `signEntitlements`, `verifyEntitlements`, `entitlementsFromEnv` (HMAC-SHA256 token; `node:crypto` only)        |

The server-only COGS/pricing model that used to sit beside these moved to
[`@xnetjs/cloud/cost`](../cloud/src/cost) — the hub never needs it.

## Invariant

`packages/hub/src/config.ts` calls `entitlementsFromEnv()`; with no `HUB_PLAN`
it returns nothing and the hub keeps its own `DEFAULT_CONFIG`. **Never make the
hub depend on `@xnetjs/cloud`** — only on this package.
