# @xnetjs/crypto

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

- Updated dependencies [[`c5ffa73`](https://github.com/crs48/xNet/commit/c5ffa7357c6e450560f15912d0a53eeb780695e6), [`7d065d7`](https://github.com/crs48/xNet/commit/7d065d7c4f0bf535ae842e4c98ba841da6e7d9fe)]:
  - @xnetjs/core@3.0.0

## 2.5.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@2.5.0

## 2.4.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@2.4.0

## 2.3.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@2.3.0

## 2.2.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@2.2.0

## 2.1.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@2.1.0

## 2.0.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@2.0.0

## 1.0.0

### Patch Changes

- Updated dependencies [[`e6b4c6f`](https://github.com/crs48/xNet/commit/e6b4c6f95b2715289ff35ae37ebd6be7eeba5174), [`38fd26f`](https://github.com/crs48/xNet/commit/38fd26f3074176ecb73b6b04b8226f2b28d2258c), [`1de6587`](https://github.com/crs48/xNet/commit/1de658746fb4b5420f8f92517f9c135562d23d28)]:
  - @xnetjs/core@1.0.0

## 0.12.0

### Patch Changes

- Updated dependencies [[`5866992`](https://github.com/crs48/xNet/commit/5866992b73a69a92321c7319a40834019f7f7141)]:
  - @xnetjs/core@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`92708ab`](https://github.com/crs48/xNet/commit/92708ab09f2334b1ee02fef4cea654c1aed6b0ed)]:
  - @xnetjs/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies [[`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4)]:
  - @xnetjs/core@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @xnetjs/core@0.0.3

## 0.0.2

### Patch Changes

- cd2a564: Set up automated npm publishing via Changesets and GitHub Actions trusted publishing, and standardize package publish metadata (public access, provenance, files, and dist entrypoints) for the initial @xnetjs release set including the React package chain.
- Updated dependencies [cd2a564]
  - @xnetjs/core@0.0.2
