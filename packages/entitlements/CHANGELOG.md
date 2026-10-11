# @xnetjs/entitlements

## 1.0.0

### Major Changes

- [#673](https://github.com/crs48/xNet/pull/673) [`0a0dff5`](https://github.com/crs48/xNet/commit/0a0dff533b209f533aa104de0cea731fd707aab9) Thanks [@crs48](https://github.com/crs48)! - Billing read-only mode (exploration 0418).

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

### Minor Changes

- [#699](https://github.com/crs48/xNet/pull/699) [`a8318a6`](https://github.com/crs48/xNet/commit/a8318a691bd0501006b9fba5e94fea19eadefd0b) Thanks [@crs48](https://github.com/crs48)! - Seat helpers for tenant rosters: `seatsUsed()` and `canAdmitMember()`, plus a `TenantMemberRole` in which `guest` is admitted but never billed. A seat is capacity provisioned for a collaborator, not an audience member the customer brought — so a flat-billed plan is never capped, and enforcement refuses admission rather than evicting anyone already connected.

## 0.0.2

### Patch Changes

- [#319](https://github.com/crs48/xNet/pull/319) [`2e7e4c7`](https://github.com/crs48/xNet/commit/2e7e4c797d4b1411e18e2a51a84ec87d8ea48156) Thanks [@crs48](https://github.com/crs48)! - Fix the managed-AI plan model IDs to match OpenRouter's catalog: the Anthropic
  models use a dotted version (`anthropic/claude-haiku-4.5`,
  `anthropic/claude-sonnet-4.6`, `anthropic/claude-opus-4.8`), not a dashed one.
  The previous dashed IDs (`…-4-5` / `…-4-6` / `…-4-8`) don't exist upstream, so a
  tenant on a default Anthropic model got a model-not-found error. The OpenAI and
  Google IDs were already correct.
