# L1 · Data Model

**This document is normative.** Part of [XNet Protocol `xnet/1.0`](00-overview.md).

L1 is the heart of the protocol — the part that makes "the data model the data
model." It defines what a node is, how it is named, how it mutates, and how
concurrent mutations converge. An implementation that gets L1 right can fully
participate in the node graph.

Reference: [`packages/data/src/schema/node.ts`](../../../packages/data/src/schema/node.ts),
[`packages/sync/src/change.ts`](../../../packages/sync/src/change.ts),
[`packages/data/src/store/types.ts`](../../../packages/data/src/store/types.ts).

## 1. The Node

A **Node** is the atomic unit of XNet data. Every node, in every implementation,
has exactly these four universal fields; all other fields are defined by the
node's schema.

```ts
interface Node {
  id: string            // unique node id (see §2)
  schemaId: SchemaIRI   // "xnet://authority/Name@version" (see §4)
  createdAt: number     // Unix milliseconds, set on first change
  createdBy: DID        // did:key of the creator; IMMUTABLE
  [key: string]: unknown // schema-defined properties
}
```

Invariants (MUST):

- `id` is present and stable for the node's lifetime.
- `schemaId` is a valid [`SchemaIRI`](#4-schema-references-schemairi).
- `createdAt` / `createdBy` are set when the node's **first** change is applied
  and never change thereafter. `createdBy` is the authorial DID and the root of
  the node's provenance.
- A node is **soft‑deleted**, never hard‑deleted, by a change with `deleted:
  true`; its tombstone and history remain.

## 2. Node identifiers

Node ids are opaque, collision‑resistant strings. The reference implementation
uses [`nanoid`](https://github.com/ai/nanoid) (21 chars, URL‑safe alphabet
`A‑Za‑z0‑9_-`, ~126 bits). Implementations:

- MUST treat ids as opaque byte‑strings for equality and MUST NOT assume sort
  order encodes time (ordering comes from Lamport clocks, §7).
- SHOULD generate ids with ≥120 bits of entropy from a URL‑safe alphabet.
- MAY use a different id scheme internally, but ids that travel on the wire MUST
  be preserved exactly.

## 3. Properties

A schema declares typed properties. `xnet/1.0` defines this property‑type
vocabulary (reference:
[`packages/data/src/schema/types.ts`](../../../packages/data/src/schema/types.ts)):

`text`, `number`, `checkbox`, `json`, `date`, `dateRange`, `select`,
`multiSelect`, `person` (a DID), `relation` (a node id or array of ids),
`rollup`, `formula`, `url`, `email`, `phone`, `file`, `created`, `updated`,
`createdBy`.

Property **values** in changes and materialized state are plain JSON values.
Computed types (`rollup`, `formula`, `created`, `updated`, `createdBy`) are
derived, not authored. Implementations MUST round‑trip unknown properties they
cannot interpret (forward compatibility) rather than dropping them.

## 4. Schema references (`SchemaIRI`)

```
SchemaIRI = "xnet://" authority "/" Name ( "@" semver )?
```

Examples: `xnet://xnet.fyi/Page@1.0.0`, `xnet://acme-corp.com/Project@1.0.0`,
`xnet://did:key:z6Mk…/Recipe@1.0.0`. An IRI without an explicit version is
interpreted as `@1.0.0` (`DEFAULT_SCHEMA_VERSION`). The `authority` names who
governs the schema; the version is semver and participates in
[evolution rules](05-schema-evolution.md).

**Resolution (how an authority → a schema document).** `xnet/1.0` defines:

1. **Built‑in authority `xnet.fyi`** — implementations ship these schemas (the
   L4 application profile). They MAY be resolved offline.
2. **DID authority** (`xnet://did:key:…/…`) — the schema is itself an XNet node
   authored by that DID; resolve it through normal node sync.
3. **Domain authority** (`xnet://example.com/…`) — RESERVED for `xnet/1.1`:
   resolution via a `.well-known` document anchored by DNS, following the
   AT‑Protocol/Lexicon pattern. Implementations MAY ignore domain authorities in
   `xnet/1.0`.

Schemas are JSON‑Schema‑shaped documents, **not** JSON‑LD/RDF. (See
[exploration 0200](../../explorations/0200_%5B_%5D_PORTABLE_XNET_PROTOCOL_BOUNDARIES_AND_STANDARD.md)
for why full JSON‑LD is deliberately avoided.) A node is self‑describing via its
`schemaId`, so schema‑agnostic relay and storage are possible without resolving
the schema.

## 5. The Change record

A node is never mutated in place. Its state is the fold of an append‑only log of
signed **Change** records ([`change.ts`](../../../packages/sync/src/change.ts)):

```ts
interface Change<T> {
  protocolVersion?: number      // 3 in xnet/1.0 (CURRENT_PROTOCOL_VERSION)
  id: string                    // unique change id
  type: string                  // "node-change"
  payload: T                    // NodePayload (below)
  hash: ContentId               // "cid:blake3:<hex>" over canonical bytes (§6)
  parentHash: ContentId | null  // previous change's hash — the causal chain
  authorDID: DID
  signature: Uint8Array         // Ed25519 over UTF-8(hash) (§6)
  wallTime: number              // Unix ms (display/tiebreak only)
  lamport: number               // logical clock (ordering / LWW)
  batchId?: string; batchIndex?: number; batchSize?: number // atomic batches
}

interface NodePayload {
  nodeId: string
  schemaId?: SchemaIRI                  // REQUIRED on the first change only
  properties: Record<string, unknown>  // sparse: only changed properties
  deleted?: boolean
}
```

Rules (MUST):

- The **first** change for a `nodeId` carries `schemaId`; later changes omit it
  and carry only changed properties.
- `parentHash` links to the author's previous change in the same document,
  forming a per‑author hash chain (tamper‑evidence + causal ordering).
- Changes MAY be grouped into an **atomic batch** (`batchId`/`batchIndex`/
  `batchSize`); a consumer applies a batch all‑or‑nothing.

## 6. Canonicalization, hashing & signing — the byte‑exact contract

This is the single most important interop rule in the protocol. **Two
implementations that disagree on these bytes cannot verify each other's
signatures.** The algorithm (reference: `computeChangeHash` / `signChange` in
[`change.ts`](../../../packages/sync/src/change.ts)):

**Step 1 — select fields to hash.** Take the unsigned change (all fields *except*
`hash` and `signature`). If `protocolVersion` is `0` or absent (legacy), remove
the `protocolVersion` field before hashing. For `xnet/1.0` (`protocolVersion =
3`), keep it.

**Step 2 — canonical JSON.** Serialize with:
- Object keys sorted **lexicographically, recursively** at every nesting level
  (by UTF‑16 code unit, i.e. JavaScript `Array.prototype.sort` default / the
  `<` operator on strings).
- **No insignificant whitespace** (equivalent to `JSON.stringify` with no
  spacing).
- Arrays keep their order.
- Fields whose value is `undefined` are **omitted** (so an absent optional batch
  field contributes nothing).
- Numbers serialized as JSON renders them (integers without a decimal point;
  `wallTime` and `lamport` are integers).
- The result is encoded as **UTF‑8** bytes.

**Step 3 — hash.** `digest = BLAKE3(utf8_canonical)`; the change hash is the
string `"cid:blake3:" + lowercase_hex(digest)`.

**Step 4 — sign.** `signature = Ed25519_sign( UTF8( hash_string ), signing_key )`.
Note the signature covers the **UTF‑8 bytes of the `cid:blake3:<hex>` string**,
not the raw 32‑byte digest.

Verification reverses steps 3–4: recompute the hash from the change's fields,
confirm it equals the carried `hash`, then verify the Ed25519 signature over
`UTF8(hash)` against the public key recovered from `authorDID`.

> Reference canonicalization in JavaScript:
> ```js
> const sorted = sortKeysRecursively(unsignedChangeWithoutHashAndSig)
> const bytes  = utf8(JSON.stringify(sorted))          // compact, sorted
> const hash   = "cid:blake3:" + hex(blake3(bytes))
> const sig    = ed25519.sign(utf8(hash), signingKey)
> ```
> Equivalent in Python: `json.dumps(obj, sort_keys=True, separators=(",", ":"))`
> then `.encode("utf-8")`, `blake3(...).hexdigest()`, `SigningKey(seed).sign(...)`.
> A 30‑line cross‑language reference lives in
> [`conformance/reference/`](../../../conformance/reference/).

The [golden vectors](90-conformance.md) (`conformance/vectors/change/`) pin
known `{ unsigned change, seed } → { did, canonicalBytes, hash, signature }`
tuples that every implementation MUST reproduce.

## 7. Conflict resolution: Lamport clocks + Last‑Write‑Wins

Materialized node state carries, **per property**, a timestamp `{ lamport,
wallTime }`. When two changes touch the same property:

1. Higher **`lamport`** wins.
2. Tie on `lamport` → higher `wallTime` wins.
3. Tie on both → the **grinding-resistant tiebreak key** (below) decides for
   changes at `protocolVersion ≥ 4`; otherwise higher `authorDID` wins,
   compared **by UTF-16 code unit** (the JS `<`/`>` operators, same order as the
   §6 canonical-JSON key sort). Implementations MUST NOT use locale-aware
   collation (e.g. JS `localeCompare`): it is locale- and ICU-version-dependent,
   so it would make convergence non-deterministic across peers. The legacy
   author rule is pinned by
   `conformance/vectors/lww/0004-tie-author-case-codeunit.json`.

### 7.1 Grinding-resistant final tiebreak (`protocolVersion ≥ 4`)

The raw-`authorDID` tiebreak is **grindable**: a `did:key` is a free,
attacker-chosen function of a keypair, so an attacker can grind a vanity DID
that sorts highest and win *every* concurrent-write tie against every honest
peer, permanently (exploration 0300). From `protocolVersion 4` the final rung is
instead a per-conflict **tiebreak key**:

```
tiebreakKey = BLAKE3_hex( authorDID ‖ 0x1f ‖ propertyKey ‖ 0x1f ‖ canonicalJSON(value) )
```

where `canonicalJSON` is the §6 recursive key-sorted encoding and a deletion
(`value` absent) canonicalises as `null`. On a `lamport`+`wallTime` tie between
two v4 changes, the **larger `tiebreakKey`** wins outright (author is
irrelevant); if either change is pre-v4 (no key) or the keys are equal, the
comparison falls back to the `authorDID` rule so mixed fleets and the legacy
vectors still agree. Because the key is a random-oracle function of *what is
written* (author + property + value — all fixed by the write's intent), a ground
identity is re-randomised per `(property, value)` and wins **no durable,
universal advantage**. Pinned by
`conformance/vectors/lww/0005-tie-grinding-resistant-key.json`.

Lamport clocks advance per the standard rule (on receive, `lamport =
max(local, incoming) + 1`). LWW is **per property**, so concurrent edits to
*different* properties of the same node both survive. Reference:
[`store/types.ts`](../../../packages/data/src/store/types.ts) (`NodeState`,
`PropertyTimestamp`) and [`lww.ts`](../../../packages/core/src/lww.ts)
(`compareLwwStamps`, `computeLwwTiebreakKey`).

The [LWW golden vectors](90-conformance.md) (`conformance/vectors/lww/`) give
change sequences and the single converged `NodeState` they MUST produce
regardless of apply order.

### 7.2 Security considerations (residual grinding surface)

The v4 tiebreak removes the *durable, universal* grinding win, but two residual
facts are deliberately **not** closed by the ordering rule and MUST be
understood by implementers:

- **Identity is free (Sybil / per-conflict grind).** Creating a `did:key` costs
  nothing, so an attacker who already knows a specific victim change *can* still
  grind their own change (its `value`, or a fresh keypair) to win that one
  conflict — a reactive, per-conflict, low-value attack, not a permanent one.
  Making a tie-win *cost* less than grinding it — the `wallTime` upper bound at
  the relay, per-writer rate limits, and keeping what a tie-win is worth small
  (an LWW property overwrite) — is the practical mitigation. A hard identity
  cost (proof-of-work/registration) is out of scope for local-first operation.
- **The north star is causal validity, not a better hash.** Kleppmann's *Making
  CRDTs Byzantine Fault Tolerant* (PaPoC 2022) uses content hashes for
  identity/dedup only and derives order from *provably-shared causal state*
  (`before(u)` + a Lamport-timestamp validity check), which forecloses the
  grinding class entirely. xNet does not implement this today; the v4 key is the
  cheap, local-first-preserving step. See exploration 0301 for an optional
  hub-arbitration finality layer.

## 8. The document codec (where Yjs lives — and why it is opaque)

A schema MAY declare a collaborative **document body** via `document: 'yjs'`.
Such nodes carry `documentContent`: an opaque binary blob (a
`Y.encodeStateAsUpdate` byte string in the reference implementation).

The protocol treats this blob as an **opaque, versioned codec payload**:

- A `documentCodec` discriminator identifies the format: `yjs-v1` (the only one
  REQUIRED‑to‑transport in `xnet/1.0`), with `automerge-2` and `none` reserved.
- Implementations **MUST transport and persist** document blobs faithfully
  (byte‑preserving) even if they do not interpret the codec.
- Interpreting a codec (merging Yjs updates, extracting text) is **OPTIONAL**. An
  implementation that cannot parse `yjs-v1` still fully participates in the node
  graph, identity, replication, and authorization — it simply relays the body.

This is the seam that makes XNet portable without porting a CRDT byte format
across languages: the [Yjs sync envelope](03-replication.md) authenticates and
routes the bytes; only peers that *use* the document need a Yjs‑compatible
library (e.g. [yrs](https://github.com/y-crdt/y-crdt)). The wire format of the
envelope is specified in [L2](03-replication.md); the Yjs update bytes
themselves follow [y‑protocols](https://github.com/yjs/y-protocols/blob/master/PROTOCOL.md).

Continue to [L2 · Replication →](03-replication.md)
