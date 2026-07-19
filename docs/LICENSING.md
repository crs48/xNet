# Licensing

> Why the core is MIT, why exactly one package is source-available, why we are
> not going copyleft — and the specific conditions under which we would
> reconsider.

This document exists so a recurring question becomes a settled reference, the
way [`GOVERNANCE.md`](../GOVERNANCE.md) settled the CLA question. It was
recommended by
[exploration 0345](./explorations/0345_[_]_COPYLEFT_LICENSING_GPL_AGPL_VS_MIT_PLUS_FSL.md)
and written as part of
[0358](./explorations/0358_[x]_VALUE_CAPTURE_WITHOUT_ENCLOSURE_MOATS_SUBSTRATES_AND_THE_SLEEP_TEST.md).

---

## The shape

| Surface | Licence |
| --- | --- |
| Root repository | **MIT**, © 2026 Chris Smothers |
| Every `@xnetjs/*` package published to npm | **MIT**, declared in its own `package.json` |
| `packages/cloud` + `apps/cloud` | **FSL-1.1-Apache-2.0** — source-available, non-compete, **auto-converts to Apache-2.0 after two years** |
| Marketplace plugins | An allowlist: `MIT`, `Apache-2.0`, `AGPL-3.0-only`, `FSL-1.1-MIT`, `FSL-1.1-Apache-2.0` |
| Contributions | **Inbound = outbound.** DCO sign-off, **no CLA**, no copyright assignment |

One package in the tree is not MIT. That is the whole commercial fence.

---

## Why MIT for the core

**Because reach is the product.** The Charter's guarantees — Own, Exit,
Commons — are delivered by *data architecture*, not by licence text: the
protocol spec, portable `did:key` identity, verified `.xnetpack` export, and
hubs anyone can run. None of those get stronger under copyleft.

What copyleft *would* change is who can embed the SDK, and the answer would
exclude most of the developers the adoption strategy depends on. Every widely
adopted local-first peer — Automerge, Yjs, Jazz, DXOS, Evolu, ElectricSQL,
Zero, PowerSync — is MIT or Apache-2.0. The one AGPL entrant built neither a
moat nor an ecosystem.

There is also a load-bearing economic reason, set out in
[`ECONOMICS.md`](./ECONOMICS.md): the entitlements contract
(`packages/entitlements/`) is **MIT and dependency-free**, so a self-hosted hub
never phones home. That is what makes the Charter's BATNA test true in code
rather than in prose — and it only works if the core is permissive.

## Why FSL for the cloud layer

`packages/cloud` is the commercial control plane: provisioning, billing,
metering, the AI gateway. FSL-1.1-Apache-2.0 keeps the source readable and
auditable, forbids launching a competing managed service with it, and
**converts to Apache-2.0 after two years** — so the fence is time-boxed by
construction rather than by promise.

The boundary is CI-enforced, not aspirational
([`scripts/check-cloud-boundary.sh`](../scripts/check-cloud-boundary.sh)):
`packages/cloud` must carry the FSL licence and a real `LICENSE` file; only
`apps/cloud` may depend on it; the self-hostable hub must never import it; and
Cloud must provision the same hub the public can install.

## Why not GPL, AGPL, or MPL

- **GPL/AGPL on an npm SDK is adoption-fatal, not protective.** It restricts
  the layer where we need reach and protects a layer that is not under threat.
- **Copyleft does not deliver the protection it promises.** MongoDB was
  *already* AGPL and concluded it had failed; AWS answered with DocumentDB,
  OpenSearch and Valkey regardless. RedMonk found no revenue inflection from
  any restrictive relicensing.
- **MPL-2.0** is npm-compatible but was proven useless as protection
  (pre-BUSL HashiCorp) — friction without benefit.
- **Dual-licensing AGPL + commercial requires a CLA**, which breaks the
  explicit no-CLA promise in [`CONTRIBUTING.md`](../CONTRIBUTING.md) and
  [`GOVERNANCE.md`](../GOVERNANCE.md).

**Copyleft at the edge is fine; copyleft in the publishable core is fatal.**
That is why `AGPL-3.0-only` is an allowed *plugin* licence
([`scripts/check-plugin-licenses.mjs`](../scripts/check-plugin-licenses.mjs))
while the core stays MIT.

---

## Reopen tripwires

"Never copyleft" should be a monitored position, not dogma. Reopen the
AGPL-hub-only option only if **all three** of these hold:

1. **A commercial operator is running *modified, unpublished* hubs as a
   competing managed service at material scale** — the specific harm AGPL §13
   addresses. Unmodified redistribution is not this.
2. **The FSL cloud layer demonstrably cannot fence it** — i.e. the operator
   competes with self-hosted-hub *support*, not with xNet Cloud.
3. **The project is willing to adopt the CLA that monetizing it requires**,
   with the community cost that entails.

Any one of these alone is not a trigger. If you are reading this while
arguing for copyleft, check all three honestly first — and note that
[0358](./explorations/0358_[x]_VALUE_CAPTURE_WITHOUT_ENCLOSURE_MOATS_SUBSTRATES_AND_THE_SLEEP_TEST.md)
found that restrictive relicensing mostly did *not* rescue the companies that
tried it, because the variable that mattered was substitution cost rather than
licence text.

## The guardrails that keep this honest

| Guardrail | What it enforces |
| --- | --- |
| [`scripts/check-cloud-boundary.sh`](../scripts/check-cloud-boundary.sh) | The MIT/FSL boundary and anchor tenancy; has a `--selftest` |
| [`scripts/check-plugin-licenses.mjs`](../scripts/check-plugin-licenses.mjs) | Every marketplace listing declares an allowlisted licence |
| [`scripts/check-publish-closure.mjs`](../scripts/check-publish-closure.mjs) | No publishable package depends on an unpublishable one |
| [`TRADEMARK.md`](../TRADEMARK.md) | The name is FRAND and never fences the code |

**Trademark is not a licence.** The code is MIT; the mark keeps things honest.
We will never use trademark policy to stop anyone forking the code, running
their own hub, or re-implementing the protocol.
