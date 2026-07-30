# @xnetjs/sync

## 3.0.0

### Minor Changes

- [#563](https://github.com/crs48/xNet/pull/563) [`33f4b9e`](https://github.com/crs48/xNet/commit/33f4b9ef38c72b2e898f7a4a4de83cc08b0aea88) Thanks [@crs48](https://github.com/crs48)! - Bulk changes: batched push frames and batch commits (exploration 0357)

  Large imports, deletes, and migrations are still N changes (one per node) —
  that is what makes per-node history, per-property LWW, and selective sync
  work — but they no longer pay a per-change price on the wire or in
  verification.
  - `@xnetjs/crypto` adds `verifyFast`/`verifyMany`, backed by WebCrypto
    Ed25519 where the runtime has it (~13x faster than the pure-JS verifier,
    measured 101µs vs 1374µs), with an automatic fallback.
  - `@xnetjs/sync` adds `BatchCommit`: one signature covering up to 1000
    ordered change hashes, so verifying a batch costs one signature check plus
    the hash recomputations a verifier already owes. Additive — the change
    record, its hash recipe, and LWW ordering are unchanged.
  - `.xnetpack` bundles now carry `commits.ndjson`; importing a self-export
    verifies with one signature per 1000 changes instead of one per change.
    Bundles without it import exactly as before.
  - Clients batch outbound changes into `node-change-batch` frames when the hub
    advertises `batch-push`, and fall back to one frame per change otherwise.
    Hub ingest of 10,000 changes drops from ~250s (wire-bound) to 570ms.

  Batching is transport and authentication only: every change is still verified,
  authorized, quota-checked, and LWW-applied individually.

### Patch Changes

- [#571](https://github.com/crs48/xNet/pull/571) [`c5ffa73`](https://github.com/crs48/xNet/commit/c5ffa7357c6e450560f15912d0a53eeb780695e6) Thanks [@crs48](https://github.com/crs48)! - Document alpha status in every package README. xNet is released — these packages
  are on npm and usable today — but it is early software: APIs can change between
  releases, sometimes without a migration path. Each README now says so up front,
  so the notice is visible on the npm package page. Docs only; no code changes.

- [#587](https://github.com/crs48/xNet/pull/587) [`7d065d7`](https://github.com/crs48/xNet/commit/7d065d7c4f0bf535ae842e4c98ba841da6e7d9fe) Thanks [@crs48](https://github.com/crs48)! - Fix TypeScript type resolution for every package's export map, and ship
  `@xnetjs/data/portability`.

  `types` was ordered after `import` in 48 export subpaths across 19 packages.
  Export conditions are order-sensitive, so TypeScript could resolve the wrong
  entry — or no types at all — depending on the consumer's `moduleResolution`.
  `types` is now first everywhere.

  `@xnetjs/data` also advertised a `./portability` subpath that was never added to
  its build, so `@xnetjs/data/portability` — the `.xnetpack` export/import codec —
  did not resolve at all for consumers. It now builds and ships.

  Both were found by adding `publint` to CI.

- Updated dependencies [[`c5ffa73`](https://github.com/crs48/xNet/commit/c5ffa7357c6e450560f15912d0a53eeb780695e6), [`7d065d7`](https://github.com/crs48/xNet/commit/7d065d7c4f0bf535ae842e4c98ba841da6e7d9fe), [`215d61d`](https://github.com/crs48/xNet/commit/215d61d586048c7d7d2221947bdcde7966172907), [`33f4b9e`](https://github.com/crs48/xNet/commit/33f4b9ef38c72b2e898f7a4a4de83cc08b0aea88)]:
  - @xnetjs/core@3.0.0
  - @xnetjs/crypto@3.0.0
  - @xnetjs/identity@3.0.0

## 2.5.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@2.5.0
  - @xnetjs/crypto@2.5.0
  - @xnetjs/core@2.5.0

## 2.4.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@2.4.0
  - @xnetjs/crypto@2.4.0
  - @xnetjs/core@2.4.0

## 2.3.0

### Patch Changes

- Updated dependencies [[`3ea44c6`](https://github.com/crs48/xNet/commit/3ea44c6354e3f55443d3c3b49d8ca1f9c0941987)]:
  - @xnetjs/identity@2.3.0
  - @xnetjs/crypto@2.3.0
  - @xnetjs/core@2.3.0

## 2.2.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@2.2.0
  - @xnetjs/crypto@2.2.0
  - @xnetjs/core@2.2.0

## 2.1.0

### Patch Changes

- Updated dependencies [[`0a4a1de`](https://github.com/crs48/xNet/commit/0a4a1de41b0f68c197ba5f7d191706668550f708)]:
  - @xnetjs/identity@2.1.0
  - @xnetjs/crypto@2.1.0
  - @xnetjs/core@2.1.0

## 2.0.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@2.0.0
  - @xnetjs/crypto@2.0.0
  - @xnetjs/core@2.0.0

## 1.0.0

### Major Changes

- [#482](https://github.com/crs48/xNet/pull/482) [`e6b4c6f`](https://github.com/crs48/xNet/commit/e6b4c6f95b2715289ff35ae37ebd6be7eeba5174) Thanks [@crs48](https://github.com/crs48)! - Grinding-resistant Last-Write-Wins tiebreak (protocol v4, exploration 0305)

  The final LWW conflict tiebreak was the raw author DID ("higher DID wins").
  Because a `did:key` is a free, attacker-chosen function of a keypair, an
  attacker could grind a vanity DID that sorts highest and win **every**
  concurrent-write tie against every honest peer, permanently.

  Protocol v4 replaces that final rung with a per-conflict key,
  `blake3(authorDID ‖ property ‖ value)` (`computeLwwTiebreakKey` in
  `@xnetjs/core`), so the winner of a tie is a random-oracle function of _what is
  written_ — a ground identity wins no durable, universal advantage. The key is
  gated on both changes being v4 (legacy changes fall back to the author DID), is
  derived at resolution time (never part of the change hash or wire format), and
  is threaded through `PropertyTimestamp`, the SQLite `node_properties` guard (new
  nullable `tiebreak_key` column, schema v8), and every conformance kernel.

  BREAKING: `CURRENT_PROTOCOL_VERSION` is now `4` and new changes are stamped v4.
  The LWW golden vectors gain `0005-tie-grinding-resistant-key`; `LwwStamp` /
  `PropertyTimestamp` gain an optional `tiebreakKey`. Mixed fleets converge on
  exact `{lamport, wallTime}` ties only once both peers are on v4 — a transient
  rollout window affecting rare exact ties.

### Minor Changes

- [#487](https://github.com/crs48/xNet/pull/487) [`3bc1b5f`](https://github.com/crs48/xNet/commit/3bc1b5f1243cba019c60c0fda062953fa3ffb910) Thanks [@crs48](https://github.com/crs48)! - Harden the sync-integrity primitives so look-alike helpers no longer give false
  assurance (exploration 0307):
  - `verifyIntegrity` now performs **real Ed25519 signature verification** against
    the key recovered from each change's author DID (previously it only checked
    that the signature field was non-empty). It accepts an optional `resolveKey`
    override; the default is self-certifying `did:key` resolution.
  - `attemptRepair`'s `recompute-hash` action — which overwrites a change's stored
    hash and can launder tampered payloads — is now gated behind an explicit
    `{ trustHashRecompute: true }` opt-in and refused by default.
  - `AuthorizedYjsSyncProvider.handleRemoteUpdate` now enforces the Yjs update
    size cap before applying, and `validateChain` / the handler registry /
    `quickIntegrityCheck` document that they are structural-only and do not
    authenticate authorship.

### Patch Changes

- Updated dependencies [[`e6b4c6f`](https://github.com/crs48/xNet/commit/e6b4c6f95b2715289ff35ae37ebd6be7eeba5174), [`38fd26f`](https://github.com/crs48/xNet/commit/38fd26f3074176ecb73b6b04b8226f2b28d2258c), [`1de6587`](https://github.com/crs48/xNet/commit/1de658746fb4b5420f8f92517f9c135562d23d28)]:
  - @xnetjs/core@1.0.0
  - @xnetjs/crypto@1.0.0
  - @xnetjs/identity@1.0.0

## 0.12.0

### Patch Changes

- Updated dependencies [[`5866992`](https://github.com/crs48/xNet/commit/5866992b73a69a92321c7319a40834019f7f7141)]:
  - @xnetjs/core@0.12.0
  - @xnetjs/crypto@0.12.0
  - @xnetjs/identity@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.11.1
  - @xnetjs/crypto@0.11.1
  - @xnetjs/core@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.11.0
  - @xnetjs/crypto@0.11.0
  - @xnetjs/core@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.10.0
  - @xnetjs/crypto@0.10.0
  - @xnetjs/core@0.10.0

## 0.9.0

### Patch Changes

- [#455](https://github.com/crs48/xNet/pull/455) [`8955613`](https://github.com/crs48/xNet/commit/8955613cea6a27af0d5cbe483bbd66b202f2dc25) Thanks [@crs48](https://github.com/crs48)! - Housekeeping: declare `fast-check` as an explicit devDependency instead of
  relying on hoisting (dead-code gate hygiene, exploration 0294). No runtime or
  API change.
- Updated dependencies []:
  - @xnetjs/identity@0.9.0
  - @xnetjs/crypto@0.9.0
  - @xnetjs/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.8.0
  - @xnetjs/crypto@0.8.0
  - @xnetjs/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.7.0
  - @xnetjs/crypto@0.7.0
  - @xnetjs/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.6.0
  - @xnetjs/crypto@0.6.0
  - @xnetjs/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.5.0
  - @xnetjs/crypto@0.5.0
  - @xnetjs/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.4.0
  - @xnetjs/crypto@0.4.0
  - @xnetjs/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`92708ab`](https://github.com/crs48/xNet/commit/92708ab09f2334b1ee02fef4cea654c1aed6b0ed)]:
  - @xnetjs/core@0.3.0
  - @xnetjs/crypto@0.3.0
  - @xnetjs/identity@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.2.0
  - @xnetjs/crypto@0.2.0
  - @xnetjs/core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.1.2
  - @xnetjs/crypto@0.1.2
  - @xnetjs/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.1.1
  - @xnetjs/crypto@0.1.1
  - @xnetjs/core@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies [[`4fb460a`](https://github.com/crs48/xNet/commit/4fb460a24061f818d3f99a166876d9cd1b3d7544), [`d7a87da`](https://github.com/crs48/xNet/commit/d7a87daf84ea86d6d26eed3fd61314a60e1d7cbf), [`fc3aa1d`](https://github.com/crs48/xNet/commit/fc3aa1dba2cf40844ca38f7cc816cddc981d9022), [`5da8d92`](https://github.com/crs48/xNet/commit/5da8d9206797183c69dc7c4f3aae3e1d9cec2e5a), [`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4), [`b327f99`](https://github.com/crs48/xNet/commit/b327f99a9448ce8724c09c66058e8e1daadd44bf), [`ddf47b9`](https://github.com/crs48/xNet/commit/ddf47b9cac403b6ff452f47e1a4a9065f393ac1c)]:
  - @xnetjs/identity@0.1.0
  - @xnetjs/core@0.1.0
  - @xnetjs/crypto@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @xnetjs/identity@0.0.3
  - @xnetjs/crypto@0.0.3
  - @xnetjs/core@0.0.3

## 0.0.2

### Patch Changes

- cd2a564: Set up automated npm publishing via Changesets and GitHub Actions trusted publishing, and standardize package publish metadata (public access, provenance, files, and dist entrypoints) for the initial @xnetjs release set including the React package chain.
- Updated dependencies [cd2a564]
  - @xnetjs/identity@0.0.2
  - @xnetjs/crypto@0.0.2
  - @xnetjs/core@0.0.2
