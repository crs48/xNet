---
'@xnetjs/entitlements': major
'@xnetjs/hub': major
---

Billing read-only mode (exploration 0418).

**`@xnetjs/entitlements`** — `PlanEntitlements` gains a required `writesEnabled`
field. This is a **wire-contract change**: the entitlement token is signed by the
control plane and verified by the hub, so the shape both sides agree on has
changed and the bump is major even though the field is additive in practice.

The field is not a plan feature — every entry in `PLAN_CATALOG` sets it to
`true`. It is the lever the non-payment lifecycle pulls: when a managed tenant's
payment grace window lapses, the control plane re-issues the entitlement with
`writesEnabled: false` and the hub stops accepting new data while keeping every
byte readable and exportable.

`verifyEntitlements` normalizes a **missing** `writesEnabled` to `true`, so
tokens signed before this field existed keep working across the rollover. Only an
explicit `false` blocks writes.

**`@xnetjs/hub`** — `HubConfig` gains an optional `writesEnabled`, resolved from
the signed entitlement by the new `resolveWritesEnabled` config resolver. Two
enforcement points:

- a Hono middleware refusing mutating HTTP verbs with
  `507 { code: 'billing_read_only' }`, with an allowlist so billing, auth, export
  and POST-shaped reads (`/query`, `/search`) keep working — a customer must
  never be locked out of the checkout page that ends their read-only state;
- `NodeRelayService`, which raises `NodeRelayError('BILLING_READ_ONLY', …)`,
  because the change log arrives over the sync socket and an HTTP-only guard
  would stop nothing.

A self-hosted hub has no `HUB_PLAN` token, never resolves `writesEnabled: false`,
and is unaffected — the anti-lock-in invariant from exploration 0174.
