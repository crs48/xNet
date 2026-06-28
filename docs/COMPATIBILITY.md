# xNet-compatible: claiming compatibility

> **Status:** the conformance corpus is published and runnable today; the formal
> "xNet Certified" mark + listing is part of the trademark program described in
> [`TRADEMARK.md`](../TRADEMARK.md) and is rolled out as the ecosystem matures.

xNet is an open protocol, not just one codebase. Anyone can re-implement it — in
any language, over any database — and **interoperate**. So that "xNet-compatible"
means something to users, the claim is tied to an objective, runnable test rather
than a subjective grant: an implementation is xNet-compatible for a protocol layer
when it **reproduces that layer's conformance vectors byte-for-byte.**

## What "compatible" is measured against

- The normative spec: [`docs/specs/protocol/`](./specs/protocol/) (layers L0–L3,
  umbrella version `xnet/1.0`).
- The golden vectors: [`conformance/`](../conformance) — plain-JSON
  `{ description, input, expected }` vectors any language can load, plus a
  second-language reference kernel (Python/Swift) for L0–L1.

An implementation claims conformance **to a layer** by passing that layer's
vectors:

| Layer | What it covers |
| ----- | -------------- |
| **L0** | identity — seed → `did:key` + public key |
| **L1** | change canonicalization → BLAKE3 hash → Ed25519 signature; LWW convergence |
| **L2** | replication — version handshake, catch-up filtering, signed Yjs envelope |
| **L3** | authorization expression (AST) evaluation |

## How to claim "xNet-compatible"

1. Run the conformance corpus against your implementation (see
   [`conformance/README.md`](../conformance/README.md)).
2. Pass the vectors for the layers you support.
3. Describe yourself truthfully — e.g. *"xNet-compatible (L0–L1)"* — per the
   nominative-use rules in [`TRADEMARK.md`](../TRADEMARK.md). No permission is
   needed for an honest compatibility statement; the **xNet Certified** mark and a
   public listing follow the trademark program once it is live.

## Why this exists

A spec without a conformance suite drifts (ActivityPub shipped a W3C Recommendation
with no test suite for years and implementations diverged silently). xNet ships the
corpus *with* the spec and re-verifies it in CI, and ties the brand to it — so the
label "xNet-compatible" is a promise of real interoperability, not marketing. This
mirrors CNCF's "Certified Kubernetes" model, where the trademark is gated on a
conformance suite.
