# @xnetjs/cloud

xNet Cloud — the **server-only** managed-hosting control-plane library. This is
the FSL zone of the open-core boundary (exploration 0174): source-available,
non-compete, auto-converting to Apache-2.0 two years after release. See
[`LICENSE`](./LICENSE).

It consolidates what used to be seven `@xnetjs/cloud-*` nano-packages into **one
package with module seams** (exploration 0181). Each seam is a subpath export, so
you import exactly the part you need and tree-shake the rest:

| Subpath                   | What it is                                                                                 | Notable deps      |
| ------------------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| `@xnetjs/cloud/provisioner` | Substrate-agnostic `Provisioner` lifecycle, `ShardAllocator`, `MemoryProvisioner`, adapters | —                 |
| `@xnetjs/cloud/identity`    | Two-identity model: WorkOS billing identity ↔ data DID, dual-proof binding, recovery        | —                 |
| `@xnetjs/cloud/billing`     | Pure pricing math, idempotent usage ledger, Stripe Meters adapter + `FakeStripeBilling`     | `stripe`          |
| `@xnetjs/cloud/ai`          | OpenAI-compatible gateway, budget hard-stop, usage→billing bridge, agent-safety harness     | —                 |
| `@xnetjs/cloud/storage`     | `S3BlobAdapter` (R2/S3) + the shared `StorageAdapter` contract suite                        | `@aws-sdk/client-s3` |
| `@xnetjs/cloud/litestream`  | `litestream.yml`/argv builders, supervised controller, replication-freshness checks        | —                 |
| `@xnetjs/cloud/cost`        | The COGS / gross-margin model (exploration 0178)                                            | —                 |

The bare `@xnetjs/cloud` entry re-exports all modules for convenience.

## Why one package

These were ~2,300 lines across seven private, same-licensed, always-co-deployed
packages that were never versioned independently — module boundaries dressed up
as package boundaries. Consolidating keeps the ports-and-adapters seams (as
subpath exports + an import-boundary lint rule) while dropping the per-package
ceremony, and turns the FSL boundary into a single directory with one real
license file. See [exploration 0181](../../docs/explorations/0181_[_]_CONSOLIDATE_CLOUD_INTO_ONE_PACKAGE.md).

## What is NOT here

The plan/entitlement **contract** the self-hostable hub also reads
(`resolveEntitlements`, `signEntitlements`, `entitlementsFromEnv`, the plan
catalog and types) lives in the separate, **MIT-licensed**
[`@xnetjs/entitlements`](../entitlements). That is the one seam that must stay
out of this package, so the MIT hub never depends on FSL code or on
`stripe`/`@aws-sdk`. **Never import `@xnetjs/cloud` from the hub.**

The deployable control-plane service that composes these modules is
[`apps/cloud`](../../apps/cloud) (`xnet-cloud`).

## Build & test

```bash
pnpm --filter @xnetjs/cloud build       # tsup multi-entry (one bundle per subpath)
pnpm --filter @xnetjs/cloud typecheck
pnpm --filter @xnetjs/cloud test
```
