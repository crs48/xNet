# XNet Conformance Corpus

Language‑agnostic **golden vectors** for the [XNet Protocol](../docs/specs/protocol/).
An independent implementation claims conformance to a layer by reproducing that
layer's vectors byte‑for‑byte. The vectors are plain JSON — any language can load
them.

> Why this exists: a spec without a conformance suite drifts (ActivityPub shipped
> a W3C Recommendation with no test suite for ~5 years and implementations
> diverged silently). XNet ships the corpus _with_ the spec and re‑verifies it in
> CI. See [`docs/specs/protocol/90-conformance.md`](../docs/specs/protocol/90-conformance.md).

## Layout

```
conformance/
  vectors/
    identity/     L0 · seed → did:key + public key
    change/       L1 · unsigned change → canonical bytes → BLAKE3 hash → Ed25519 sig
    lww/          L1 · change sequence → converged state (order-independent)
    replication/  L2 · version handshake, catch-up filtering, signed Yjs envelope
    authz/        L3 · authorization expression (AST) evaluation
    authz-actions/ L3 · action-expression resolution (create/update → write fallback, 0304)
  reference/
    python/       a ~100-line second-language kernel (L0 + L1)
    swift/        a Swift kernel (L0 + L1) — the Apple-platform reference
```

Each vector is `{ description, input, expected }`. The canonicalization, hashing,
and signing contract is pinned in
[L1 §6](../docs/specs/protocol/02-data-model.md); identity in
[L0 §1](../docs/specs/protocol/01-primitives.md); LWW in
[L1 §7](../docs/specs/protocol/02-data-model.md); the version handshake and
signed envelope in [L2 §3–§7](../docs/specs/protocol/03-replication.md); the
authorization expression AST in [L3 §4](../docs/specs/protocol/04-authorization.md).

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

| Implementation                         | Language   | L0 identity | L1 change | L1 lww | L2  | L3  |
| -------------------------------------- | ---------- | :---------: | :-------: | :----: | :-: | :-: |
| [`xNet`](..) (reference)               | TypeScript |     ✅      |    ✅     |   ✅   | ✅  | ✅  |
| [`xnet-core`](../rust/xnet-core)       | Rust       |     ✅      |    ✅     |   ✅   | ✅  | ✅  |
| [`reference/python`](reference/python) | Python     |     ✅      |    ✅     |   —    |  —  |  —  |
| [`reference/swift`](reference/swift)   | Swift      |     ✅      |    ✅     |   —    |  —  |  —  |
| _add yours_                            |            |             |           |        |     |     |

`rust/xnet-core` is the **portable kernel** (not just a verifier): it passes
every suite — and, with deterministic RFC-8032 Ed25519, **re-signs** changes
byte-for-byte — making it a candidate to back the Swift/Kotlin/.NET SDKs via
UniFFI (exploration 0210, Phase 2).

`xnet/1.0`'s corpus began with the **interop kernel** (L0 + L1) — the minimum
that lets an independent implementation create, sign, verify, and converge nodes.
It now also pins a starter slice of **L2** (the version handshake, catch-up
filtering, and the byte-exact signed Yjs envelope) and **L3** (the authorization
expression-AST evaluation — the deny-wins boolean core). Deeper L2/L3 surfaces
(full message round-trips, end-to-end decision traces with role resolution over a
node graph) remain tracked as [XPPs](../docs/specs/protocol/xpp/) and are added as
those reference paths stabilise.

To add your implementation: load the JSON vectors, reproduce `expected` from
`input`, and open a PR adding a row here.
