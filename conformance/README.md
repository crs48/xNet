# XNet Conformance Corpus

Language‑agnostic **golden vectors** for the [XNet Protocol](../docs/specs/protocol/).
An independent implementation claims conformance to a layer by reproducing that
layer's vectors byte‑for‑byte. The vectors are plain JSON — any language can load
them.

> Why this exists: a spec without a conformance suite drifts (ActivityPub shipped
> a W3C Recommendation with no test suite for ~5 years and implementations
> diverged silently). XNet ships the corpus *with* the spec and re‑verifies it in
> CI. See [`docs/specs/protocol/90-conformance.md`](../docs/specs/protocol/90-conformance.md).

## Layout

```
conformance/
  vectors/
    identity/   L0 · seed → did:key + public key
    change/     L1 · unsigned change → canonical bytes → BLAKE3 hash → Ed25519 sig
    lww/        L1 · change sequence → converged state (order-independent)
  reference/
    python/     a ~100-line second-language kernel that verifies the vectors
```

Each vector is `{ description, input, expected }`. The canonicalization, hashing,
and signing contract is pinned in
[L1 §6](../docs/specs/protocol/02-data-model.md); identity in
[L0 §1](../docs/specs/protocol/01-primitives.md); LWW in
[L1 §7](../docs/specs/protocol/02-data-model.md).

## Reproducing / regenerating

The reference (TypeScript) implementation generates and re‑verifies the corpus:

```bash
# verify (drift guard — run by CI)
pnpm exec vitest run --project runtime packages/runtime/src/conformance.test.ts

# regenerate after an intentional protocol change
WRITE_VECTORS=1 pnpm exec vitest run --project runtime packages/runtime/src/conformance.test.ts
```

The second‑language proof (Python):

```bash
pip install pynacl blake3 base58
python conformance/reference/python/verify_vectors.py
```

## Conformance matrix

| Implementation | Language | L0 identity | L1 change | L1 lww | L2 | L3 |
|---|---|:--:|:--:|:--:|:--:|:--:|
| [`xNet`](..) (reference) | TypeScript | ✅ | ✅ | ✅ | reference | reference |
| [`reference/python`](reference/python) | Python | ✅ | ✅ | — | — | — |
| _add yours_ | | | | | | |

`xnet/1.0`'s first corpus covers the **interop kernel** (L0 + L1) — the minimum
that lets an independent implementation create, sign, verify, and converge nodes.
The L2 (replication) and L3 (authorization) suites are tracked as
[XPPs](../docs/specs/protocol/xpp/) and added as those reference paths stabilise.

To add your implementation: load the JSON vectors, reproduce `expected` from
`input`, and open a PR adding a row here.
