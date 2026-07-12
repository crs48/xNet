# Conformance

**This document is normative.** Part of [XNet Protocol `xnet/1.0`](00-overview.md).

A specification without a conformance corpus drifts: independent implementations
diverge silently (the lesson of ActivityPub, which shipped a W3C Recommendation
with no test suite for ~5 years). XNet therefore ships a **language‑agnostic
golden‑vector corpus alongside the spec, from day one**, and re‑verifies it in
CI so the prose cannot drift from the reference implementation.

The corpus lives at [`conformance/`](../../../conformance/).

## 1. What a conforming implementation does

An implementation claims conformance to a layer by **reproducing that layer's
vectors byte‑for‑byte**. The vectors are plain JSON — any language can load them.

| Suite                    | Layer | Proves                                                                                                                    |
| ------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| `vectors/identity/`      | L0    | seed → `did:key`, public key derivation                                                                                   |
| `vectors/change/`        | L1    | unsigned change → canonical bytes → BLAKE3 hash → Ed25519 signature                                                       |
| `vectors/lww/`           | L1    | change sequence → converged `NodeState` (order‑independent)                                                               |
| `vectors/replication/`   | L2    | version handshake, catch‑up filtering, signed Yjs envelope                                                                |
| `vectors/authz/`         | L3    | authorization expression (AST) evaluation — `{expression, roles, isAuthenticated}` → `{allowed}`                          |
| `vectors/authz-actions/` | L3    | action‑expression resolution with the `write` fallback (0304) — `{actions, action, roles, isAuthenticated}` → `{allowed}` |

`xnet/1.0`'s first corpus covers the **interop kernel** (L0 + L1) — the minimum
that lets an independent implementation create, sign, verify, and converge
nodes. Full end‑to‑end L3 decision traces (`{graph, subject, action, node}` →
decision) are tracked as [XPPs](xpp/) and added as the corresponding reference
paths stabilise.

## 2. Vector format

Each vector is self‑describing: an `input` an implementation feeds to its code and
an `expected` it must reproduce. Example (`vectors/change/`):

```jsonc
{
  "description": "First change for a Page node, fixed author seed",
  "input": {
    "authorSeedHex": "0000…20-bytes…",
    "unsignedChange": {
      "protocolVersion": 3,
      "id": "chg-0001",
      "type": "node-change",
      "payload": {
        "nodeId": "node-0001",
        "schemaId": "xnet://xnet.fyi/Page@1.0.0",
        "properties": { "title": "Welcome" }
      },
      "parentHash": null,
      "wallTime": 1718641200000,
      "lamport": 1
    }
  },
  "expected": {
    "authorDID": "did:key:z6Mk…",
    "canonicalJson": "{\"authorDID\":\"did:key:z6Mk…\",…}",
    "hash": "cid:blake3:9f86d081…",
    "signatureBase64": "kQX9c2…=="
  }
}
```

The canonicalization, hashing, and signing rules are pinned in
[L1 §6](02-data-model.md). The `canonicalJson` field is included so a failing
implementation can diff the exact bytes.

## 3. The reference kernel (second language)

[`conformance/reference/`](../../../conformance/reference/) contains a tiny,
dependency‑light implementation of the L0+L1 kernel in a **second language**
(Python) that loads the vectors and verifies them. Its purpose is to _prove the
boundary is real_ — that the spec, not the TypeScript source, is sufficient to
interoperate. If ~100 lines of Python can derive the same DID and verify a
TypeScript‑signed change, the protocol is portable.

## 4. CI drift guard

The reference implementation re‑derives every vector from its own code and
asserts equality with the committed JSON
([`packages/runtime/src/conformance.test.ts`](../../../packages/runtime/src/conformance.test.ts)).
A change to canonicalization, hashing, or DID derivation that is not reflected in
the corpus **fails CI** — making the spec's central claim (these exact bytes)
executable rather than aspirational. To regenerate after an intentional change:

```bash
WRITE_VECTORS=1 pnpm exec vitest run --project runtime packages/runtime/src/conformance.test.ts
```

## 5. The conformance matrix

Following [Willow](https://willowprotocol.org/)'s lightweight model, conforming
implementations are tracked in a per‑layer matrix on the website
([`/docs/protocol/conformance`](https://xnet.fyi/docs/protocol/conformance)) and
in [`conformance/README.md`](../../../conformance/README.md): which implementation
passes which suite, as of which date. This is low‑overhead but credible — a
reader can see exactly what interoperates.

| Implementation                 | L0 identity | L1 change | L1 lww | L2             | L3             |
| ------------------------------ | ----------- | --------- | ------ | -------------- | -------------- |
| `xNet` (TypeScript, reference) | ✅          | ✅        | ✅     | ✅ (reference) | ✅ (reference) |
| `reference/` kernel (Python)   | ✅          | ✅        | —      | —              | —              |
| _your implementation here_     |             |           |        |                |                |
