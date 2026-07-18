# The xNet Protocol

This directory is the **normative source of truth** for the xNet protocol — the
written interface that lets xNet be re-implemented in any language, over any
database, by anyone, while remaining interoperable with every other conforming
implementation.

> The `xNet` TypeScript monorepo is **one implementation** of this protocol, not
> the protocol itself. This spec is what makes the difference real.

Background and rationale:
[`docs/explorations/0200_[_]_PORTABLE_XNET_PROTOCOL_BOUNDARIES_AND_STANDARD.md`](../../explorations/0200_%5B_%5D_PORTABLE_XNET_PROTOCOL_BOUNDARIES_AND_STANDARD.md).

## The documents

| File | Layer | Normative? | What it pins |
|------|-------|-----------|--------------|
| [`00-overview.md`](00-overview.md) | — | Yes | Scope, conformance language, the layer model, the umbrella **xNet Protocol Version** |
| [`01-primitives.md`](01-primitives.md) | **L0** | Yes | did:key/Ed25519, XChaCha20‑Poly1305, X25519+HKDF, BLAKE3/SHA‑256, signature levels, UCAN |
| [`02-data-model.md`](02-data-model.md) | **L1** | Yes | `Node`, `SchemaIRI` + resolution, property types, the `Change` record, **canonicalization + hashing**, Lamport/LWW, the document codec |
| [`03-replication.md`](03-replication.md) | **L2** | Yes | Change‑relay messages, the signed Yjs envelope, awareness, the version handshake, transport bindings |
| [`04-authorization.md`](04-authorization.md) | **L3** | Yes | Schema authorization, role resolvers, the expression AST, grants, UCAN scopes, sync‑boundary enforcement |
| [`05-schema-evolution.md`](05-schema-evolution.md) | L1+ | Yes | Versioning rules and cross‑version coexistence (lenses) |
| [`90-conformance.md`](90-conformance.md) | — | Yes | The golden‑vector corpus and how an implementation proves conformance |
| [`xpp/`](xpp/) | — | Process | The xNet Protocol Proposal (XPP) process and template |

## The boundary in one sentence

> A conforming xNet implementation agrees on **L0 primitives**, the **L1 data
> model** (especially the byte‑exact canonicalization of a `Change`), the **L2
> replication wire format**, and the **L3 authorization semantics** — and treats
> everything above (query, storage layout, UI, the built‑in application schemas)
> as private.

## How this maps to the reference implementation

| Spec concept | Reference code |
|---|---|
| `Node` shape | [`packages/data/src/schema/node.ts`](../../../packages/data/src/schema/node.ts) |
| `Change` + canonicalization + hashing | [`packages/sync/src/change.ts`](../../../packages/sync/src/change.ts) |
| Crypto primitives | [`packages/crypto/src/`](../../../packages/crypto/src/) |
| did:key + UCAN | [`packages/identity/src/`](../../../packages/identity/src/) |
| Authorization | [`packages/core/src/auth-types.ts`](../../../packages/core/src/auth-types.ts), [`packages/data/src/auth/`](../../../packages/data/src/auth/) |
| Replication wire | [`packages/hub/src/`](../../../packages/hub/src/), [`packages/network/src/`](../../../packages/network/src/), [`packages/sync/src/yjs-envelope.ts`](../../../packages/sync/src/yjs-envelope.ts) |
| Umbrella version constant | [`packages/runtime/src/protocol.ts`](../../../packages/runtime/src/protocol.ts) (re‑exported by `@xnetjs/sdk`) |
| Conformance corpus | [`conformance/`](../../../conformance/) |

The corpus in [`conformance/`](../../../conformance/) is **generated from the
reference implementation and re‑verified in CI** — so the claims in these
documents cannot silently drift from the code.
