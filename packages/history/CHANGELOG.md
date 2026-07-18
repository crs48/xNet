# @xnetjs/history

## 2.5.0

### Patch Changes

- Updated dependencies [[`c7ef045`](https://github.com/crs48/xNet/commit/c7ef0456bfc75b5813d8a9d34f465f13a1e088ae)]:
  - @xnetjs/data@2.5.0
  - @xnetjs/sync@2.5.0
  - @xnetjs/core@2.5.0

## 2.4.0

### Patch Changes

- Updated dependencies [[`1c7b9c9`](https://github.com/crs48/xNet/commit/1c7b9c9c3804fc0d4c80b032ae0ebc0163714c52)]:
  - @xnetjs/data@2.4.0
  - @xnetjs/sync@2.4.0
  - @xnetjs/core@2.4.0

## 2.3.0

### Patch Changes

- Updated dependencies [[`e2ec439`](https://github.com/crs48/xNet/commit/e2ec43932ec3b05e74765a537ae9b94a219c7c36), [`735d491`](https://github.com/crs48/xNet/commit/735d491217a964c5210140ac58925db0ecdd765e), [`d246195`](https://github.com/crs48/xNet/commit/d2461957723cc4c9e6366192670127f8bd1d458d), [`3ea44c6`](https://github.com/crs48/xNet/commit/3ea44c6354e3f55443d3c3b49d8ca1f9c0941987)]:
  - @xnetjs/data@2.3.0
  - @xnetjs/sync@2.3.0
  - @xnetjs/core@2.3.0

## 2.2.0

### Patch Changes

- Updated dependencies [[`2962c28`](https://github.com/crs48/xNet/commit/2962c28afd0b5c15ce42ee1b42e58e6c55868d5a)]:
  - @xnetjs/data@2.2.0
  - @xnetjs/sync@2.2.0
  - @xnetjs/core@2.2.0

## 2.1.0

### Patch Changes

- Updated dependencies [[`0a4a1de`](https://github.com/crs48/xNet/commit/0a4a1de41b0f68c197ba5f7d191706668550f708)]:
  - @xnetjs/data@2.1.0
  - @xnetjs/sync@2.1.0
  - @xnetjs/core@2.1.0

## 2.0.0

### Minor Changes

- [#496](https://github.com/crs48/xNet/pull/496) [`85c9700`](https://github.com/crs48/xNet/commit/85c9700d6de11459f39083a1824f9cbf79cdb7bd) Thanks [@crs48](https://github.com/crs48)! - Yjs fragment readers understand the BlockNote document schema (exploration 0312).

  Documents now live in the `content-v4` fragment using BlockNote's ProseMirror
  shape (`blockGroup > blockContainer > blockContent`); the legacy TipTap
  `content` fragment remains readable as a fallback until each doc is lazily
  imported.
  - `@xnetjs/data`: `getRichTextPlainText` extracts text from BlockNote-shaped
    rich-text cells, including the new inline atoms (`mention` → `@label`,
    `hashtag` → `#name`, `wikilink` → title, `inlineMath` → latex), while still
    reading legacy TipTap-shaped cells.
  - `@xnetjs/history`: version-diff text extraction prefers `content-v4` (legacy
    `content` fallback) and renders BlockNote inline atoms as readable text.
  - `@xnetjs/react`: new `useMergedEditorContributions` /
    `mergeEditorContributions` (+ `MergedEditorContributions` type) collect
    plugin-contributed BlockNote `blockSpecs`/`inlineContentSpecs`/`styleSpecs`
    and slash menu items from the plugin registry, running the editor
    schema-skew guard (`warnOnEditorSchemaRisks`) against the host's statically
    bundled spec names and excluding un-bundled (skew-hazard) specs.
  - `@xnetjs/runtime`: blob-CID retention scanning now also walks the
    `content-v4` and `content` fragments, so blobs referenced from page
    documents are discovered.

- [#523](https://github.com/crs48/xNet/pull/523) [`a91f278`](https://github.com/crs48/xNet/commit/a91f278ac122c588145ebb5f3981f6745b30ba66) Thanks [@crs48](https://github.com/crs48)! - Drafts P2/P3 (exploration 0329): Patchwork-style branching on the change log.
  - `@xnetjs/data`: `Draft` node schema (`DRAFT_SCHEMA_IRI`, entries map, no
    nesting); `NodeStore` draft overlay — `setCheckedOutDraft` swaps member
    reads to clone content under original ids, redirects member writes to
    clones with lazy copy-on-write, mirrors clone change events to original-id
    subscribers, and exposes `getRaw` for overlay-free reads; device-local
    draft privacy set (`markDraftPrivate`/`isDraftPrivate`).
  - `@xnetjs/history`: draft lifecycle (`createDraft`, `forkNodeIntoDraft` —
    signed snapshot-create + pinned fork point + Yjs blob fork with state
    vector, `discardDraft`, `listDrafts`, never-fork policy); merge
    (`threeWayPropertyMerge`, `mergeDraft` — one merger-signed squash batch
    with draft-born promotion via temp ids, relation remapping, deletion
    conflict cards, idempotent Yjs delta lane, provenance) and
    `refreshDraftFromMain` (floating drafts).
  - `@xnetjs/runtime`: `NodeStoreSyncProvider` gains a `shouldPublish`
    predicate; the personal node-sync room excludes draft-private nodes, and
    draft privacy is rehydrated before sync starts.

- [#523](https://github.com/crs48/xNet/pull/523) [`0f7ef43`](https://github.com/crs48/xNet/commit/0f7ef435afab91022433ae6c60c3a71510a1d036) Thanks [@crs48](https://github.com/crs48)! - Time Machine P1 (exploration 0329): frontiers, checkpoints, pins, prune horizon, scope timelines, production Yjs snapshot capture, and a React scrub hook.
  - `@xnetjs/history`: new `Frontier` primitive (hash-anchored per-node positions:
    `captureFrontier`, `frontierAtWallTime`, `frontierTarget`,
    `materializeAtFrontier`, Yjs snapshot refs + pin keys); named checkpoints
    (`createCheckpoint`, `listCheckpoints`, `deleteCheckpoint`, `pinFrontier`,
    `restoreToFrontier`); `ScopeTimeline`/`ScopeScrubCache` generalizing
    `SchemaTimeline` to arbitrary node sets; `HistoryHorizonError` +
    `HistoryEngine.getHorizon` — targets below the prune horizon now fail loudly
    instead of silently remapping to the wrong change.
  - `@xnetjs/data`: `Checkpoint` node schema (`CHECKPOINT_SCHEMA_IRI`); pin
    registry on storage adapters (`NodeStorageAdapter.pins`, `PinEntry`,
    `PinRegistry`) protecting pinned changes and Yjs snapshots from pruning and
    eviction (memory + SQLite implementations).
  - `@xnetjs/sqlite`: `pinned_changes` table (additive migration).
  - `@xnetjs/runtime`: Yjs history snapshots are now captured on production doc
    persists (throttled session-boundary/min-interval capture in NodePool).
  - `@xnetjs/react`: new `useTimeMachine` hook (hooks sub-barrel) binding a
    scrubber UI to the merged scope timeline: position/step navigation, preview +
    property diff at the scrub position, named versions, one-transaction restore,
    and history-horizon reporting.

### Patch Changes

- Updated dependencies [[`85c9700`](https://github.com/crs48/xNet/commit/85c9700d6de11459f39083a1824f9cbf79cdb7bd), [`a91f278`](https://github.com/crs48/xNet/commit/a91f278ac122c588145ebb5f3981f6745b30ba66), [`dd956e5`](https://github.com/crs48/xNet/commit/dd956e512b60f3b4288ae4fb0cb2ade875da1f9f), [`e4cb876`](https://github.com/crs48/xNet/commit/e4cb876cc49fcf94a71d015dd60683ff038b367c), [`e2e78cd`](https://github.com/crs48/xNet/commit/e2e78cd319723972591e1aae9d87af4588edfda3), [`0f7ef43`](https://github.com/crs48/xNet/commit/0f7ef435afab91022433ae6c60c3a71510a1d036)]:
  - @xnetjs/data@2.0.0
  - @xnetjs/sync@2.0.0
  - @xnetjs/core@2.0.0

## 1.0.0

### Patch Changes

- Updated dependencies [[`e6b4c6f`](https://github.com/crs48/xNet/commit/e6b4c6f95b2715289ff35ae37ebd6be7eeba5174), [`3bc1b5f`](https://github.com/crs48/xNet/commit/3bc1b5f1243cba019c60c0fda062953fa3ffb910), [`38fd26f`](https://github.com/crs48/xNet/commit/38fd26f3074176ecb73b6b04b8226f2b28d2258c), [`1de6587`](https://github.com/crs48/xNet/commit/1de658746fb4b5420f8f92517f9c135562d23d28)]:
  - @xnetjs/core@1.0.0
  - @xnetjs/sync@1.0.0
  - @xnetjs/data@1.0.0

## 0.12.0

### Patch Changes

- Updated dependencies [[`5866992`](https://github.com/crs48/xNet/commit/5866992b73a69a92321c7319a40834019f7f7141)]:
  - @xnetjs/core@0.12.0
  - @xnetjs/data@0.12.0
  - @xnetjs/sync@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.11.1
  - @xnetjs/sync@0.11.1
  - @xnetjs/core@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies [[`d9cd478`](https://github.com/crs48/xNet/commit/d9cd478e554e3bb5de6f6c58c3d1550143bdd31a)]:
  - @xnetjs/data@0.11.0
  - @xnetjs/sync@0.11.0
  - @xnetjs/core@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [[`0721fd5`](https://github.com/crs48/xNet/commit/0721fd5d263abd3242a3b10cf827fa552cbacbb7)]:
  - @xnetjs/data@0.10.0
  - @xnetjs/sync@0.10.0
  - @xnetjs/core@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [[`8955613`](https://github.com/crs48/xNet/commit/8955613cea6a27af0d5cbe483bbd66b202f2dc25), [`8bb9cc6`](https://github.com/crs48/xNet/commit/8bb9cc6752cfe0a83d91388bdc375ff03f55b852)]:
  - @xnetjs/sync@0.9.0
  - @xnetjs/data@0.9.0
  - @xnetjs/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.8.0
  - @xnetjs/sync@0.8.0
  - @xnetjs/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.7.0
  - @xnetjs/sync@0.7.0
  - @xnetjs/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`bd50f40`](https://github.com/crs48/xNet/commit/bd50f40371ab44f22eb4f015f27d38bc8b94f025)]:
  - @xnetjs/data@0.6.0
  - @xnetjs/sync@0.6.0
  - @xnetjs/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`bc6a088`](https://github.com/crs48/xNet/commit/bc6a088bf778e7126f305ea5af7c54764074de3c)]:
  - @xnetjs/data@0.5.0
  - @xnetjs/sync@0.5.0
  - @xnetjs/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`e245a3c`](https://github.com/crs48/xNet/commit/e245a3c792d4e8aa70280c9b9f0f96c213204204)]:
  - @xnetjs/data@0.4.0
  - @xnetjs/sync@0.4.0
  - @xnetjs/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`92708ab`](https://github.com/crs48/xNet/commit/92708ab09f2334b1ee02fef4cea654c1aed6b0ed)]:
  - @xnetjs/core@0.3.0
  - @xnetjs/data@0.3.0
  - @xnetjs/sync@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.2.0
  - @xnetjs/sync@0.2.0
  - @xnetjs/core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc), [`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc)]:
  - @xnetjs/data@0.1.2
  - @xnetjs/sync@0.1.2
  - @xnetjs/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`2ab72a9`](https://github.com/crs48/xNet/commit/2ab72a9c988122635e9610f7d7353d91e96af31d)]:
  - @xnetjs/data@0.1.1
  - @xnetjs/sync@0.1.1
  - @xnetjs/core@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies [[`f626e50`](https://github.com/crs48/xNet/commit/f626e50c003e196de8dee7b3a49c4fd98df85f35), [`df76bef`](https://github.com/crs48/xNet/commit/df76bef06bbd700998b29bf1bd25658d8ae759e3), [`4658b8f`](https://github.com/crs48/xNet/commit/4658b8f1ac27af01f89b883cf6c1e5d10d2c8161), [`4aec093`](https://github.com/crs48/xNet/commit/4aec093b53647d71214b8ab05a3004b5494479d7), [`8e43142`](https://github.com/crs48/xNet/commit/8e43142d3cf4d958d3c0f857905a59420c7ab538), [`37d4462`](https://github.com/crs48/xNet/commit/37d4462105cc87d6b9e2647ca0eaeba7442d2702), [`e531d0d`](https://github.com/crs48/xNet/commit/e531d0dec9201d2649f9bcaf1392ab1a2186fe47), [`70b7e07`](https://github.com/crs48/xNet/commit/70b7e0778a7da2a74e2de637691ff71531e3faf2), [`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4), [`7d01fd6`](https://github.com/crs48/xNet/commit/7d01fd62ae7293eaf5d30f43bf24d0aa6648762b)]:
  - @xnetjs/data@0.1.0
  - @xnetjs/core@0.1.0
  - @xnetjs/sync@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.0.3
  - @xnetjs/sync@0.0.3
  - @xnetjs/core@0.0.3

## 0.0.2

### Patch Changes

- cd2a564: Set up automated npm publishing via Changesets and GitHub Actions trusted publishing, and standardize package publish metadata (public access, provenance, files, and dist entrypoints) for the initial @xnetjs release set including the React package chain.
- Updated dependencies [cd2a564]
  - @xnetjs/core@0.0.2
  - @xnetjs/data@0.0.2
  - @xnetjs/sync@0.0.2
