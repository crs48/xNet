# @xnetjs/runtime

## 0.3.2

### Patch Changes

- [#480](https://github.com/crs48/xNet/pull/480) [`5866992`](https://github.com/crs48/xNet/commit/5866992b73a69a92321c7319a40834019f7f7141) Thanks [@crs48](https://github.com/crs48)! - New `@xnetjs/core` utilities (exploration 0300 — Effect Tier 0): a
  dependency-free `RetryPolicy` vocabulary (`fixed`, `exponential`, `capped`,
  `jittered`, `limitAttempts`), a `TaggedError` base class with `isTagged`
  guard for string-discriminant errors, and a `singleFlight` promise-dedupe
  helper.

  Internal refactors onto them (no behavior change): both sync reconnect
  loops (`@xnetjs/runtime`) now share one scheduler with their existing
  backoff schedules preserved; the webhook emitter (`@xnetjs/plugins`) uses
  the shared exponential policy; the schema registry and sqlite adapter
  diagnostics memo (`@xnetjs/data`) use `singleFlight`. `NodeRelayError` and
  `PermissionError` now extend `TaggedError` — `instanceof`, `.name`, and
  `.code` matching are unchanged.

- Updated dependencies [[`5866992`](https://github.com/crs48/xNet/commit/5866992b73a69a92321c7319a40834019f7f7141)]:
  - @xnetjs/core@0.12.0
  - @xnetjs/plugins@0.12.0
  - @xnetjs/data@0.12.0
  - @xnetjs/crypto@0.12.0
  - @xnetjs/data-bridge@0.12.0
  - @xnetjs/history@0.12.0
  - @xnetjs/identity@0.12.0
  - @xnetjs/storage@0.12.0
  - @xnetjs/sync@0.12.0

## 0.3.1

### Patch Changes

- [#471](https://github.com/crs48/xNet/pull/471) [`f4ee6f9`](https://github.com/crs48/xNet/commit/f4ee6f96345f8d221100c820732e19566d7118f1) Thanks [@crs48](https://github.com/crs48)! - `SyncManager.subscribeShareRoom`/`unsubscribeShareRoom` are now refcounted, so multiple callers can subscribe to the same share room and it stays open until the last one unsubscribes (exploration 0298 follow-up — lets a channel/workspace boot-resync coexist with the per-view subscription).

- Updated dependencies []:
  - @xnetjs/history@0.11.1
  - @xnetjs/plugins@0.11.1
  - @xnetjs/data-bridge@0.11.1
  - @xnetjs/data@0.11.1
  - @xnetjs/storage@0.11.1
  - @xnetjs/sync@0.11.1
  - @xnetjs/identity@0.11.1
  - @xnetjs/crypto@0.11.1
  - @xnetjs/core@0.11.1

## 0.3.0

### Minor Changes

- [#467](https://github.com/crs48/xNet/pull/467) [`07b480d`](https://github.com/crs48/xNet/commit/07b480d14d34ba7b6d74a49233fc9842f1facfde) Thanks [@crs48](https://github.com/crs48)! - Deliver a shared chat channel's nodes to a grantee (exploration 0298). `NodeStoreSyncProvider` gains a subscribe-only mode (receives + applies a room but never publishes local changes and never advances its cursor from a live broadcast — share rooms cursor on a per-room `seq`). `SyncManager` gains `subscribeShareRoom(room)` / `unsubscribeShareRoom(room)`, and a `channelShareRoom(id)` helper is exported (re-exported from `@xnetjs/react`). Together these let a client subscribe to a channel's `xnet-channel-<id>` share room so its node, message history, and members' profiles sync in — the transport that channel share links were missing.

- [#470](https://github.com/crs48/xNet/pull/470) [`e68c016`](https://github.com/crs48/xNet/commit/e68c01661c77077489f72b97d5f90e0990aa18e1) Thanks [@crs48](https://github.com/crs48)! - Add `workspaceShareRoom(id)` (re-exported from `@xnetjs/react`) so a shared workspace (bench) node is delivered to a grantee via the same share-room mechanism as channels (exploration 0298 Phase 2).

### Patch Changes

- Updated dependencies [[`d9cd478`](https://github.com/crs48/xNet/commit/d9cd478e554e3bb5de6f6c58c3d1550143bdd31a)]:
  - @xnetjs/data@0.11.0
  - @xnetjs/data-bridge@0.11.0
  - @xnetjs/history@0.11.0
  - @xnetjs/plugins@0.11.0
  - @xnetjs/storage@0.11.0
  - @xnetjs/sync@0.11.0
  - @xnetjs/identity@0.11.0
  - @xnetjs/crypto@0.11.0
  - @xnetjs/core@0.11.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`0721fd5`](https://github.com/crs48/xNet/commit/0721fd5d263abd3242a3b10cf827fa552cbacbb7)]:
  - @xnetjs/data@0.10.0
  - @xnetjs/data-bridge@0.10.0
  - @xnetjs/history@0.10.0
  - @xnetjs/plugins@0.10.0
  - @xnetjs/storage@0.10.0
  - @xnetjs/sync@0.10.0
  - @xnetjs/identity@0.10.0
  - @xnetjs/crypto@0.10.0
  - @xnetjs/core@0.10.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`8955613`](https://github.com/crs48/xNet/commit/8955613cea6a27af0d5cbe483bbd66b202f2dc25), [`8bb9cc6`](https://github.com/crs48/xNet/commit/8bb9cc6752cfe0a83d91388bdc375ff03f55b852)]:
  - @xnetjs/sync@0.9.0
  - @xnetjs/data@0.9.0
  - @xnetjs/data-bridge@0.9.0
  - @xnetjs/history@0.9.0
  - @xnetjs/plugins@0.9.0
  - @xnetjs/storage@0.9.0
  - @xnetjs/identity@0.9.0
  - @xnetjs/crypto@0.9.0
  - @xnetjs/core@0.9.0

## 0.2.0

### Minor Changes

- [#448](https://github.com/crs48/xNet/pull/448) [`853d849`](https://github.com/crs48/xNet/commit/853d849039ebf7793dcc41ef3370def95e5dba14) Thanks [@crs48](https://github.com/crs48)! - `NodeStoreSyncProvider` now handles hub capacity rejections gracefully: on the first `QUOTA_EXCEEDED` (over the hub's per-user cap) or `STORAGE_FULL` (hub disk full) rejection it pauses outbound sync instead of re-flooding the hub, keeps local data intact, and resumes on the next reconnect. Subscribe to the new `onSyncBlocked(listener)` API (with `SyncBlockedReason`/`SyncBlockedListener` types) to surface a "storage full" notice in your app.

### Patch Changes

- Updated dependencies [[`dd3b1cb`](https://github.com/crs48/xNet/commit/dd3b1cb270386b243afe0ba28e8e2a55c9ff2726), [`677856e`](https://github.com/crs48/xNet/commit/677856e0317800a0f6e78531ae490aca744570d9)]:
  - @xnetjs/plugins@0.8.0
  - @xnetjs/history@0.8.0
  - @xnetjs/data-bridge@0.8.0
  - @xnetjs/data@0.8.0
  - @xnetjs/storage@0.8.0
  - @xnetjs/sync@0.8.0
  - @xnetjs/identity@0.8.0
  - @xnetjs/crypto@0.8.0
  - @xnetjs/core@0.8.0

## 0.1.8

### Patch Changes

- Updated dependencies [[`a5813fc`](https://github.com/crs48/xNet/commit/a5813fc432fcb44cad0caba72d8bfcb065bf5dec)]:
  - @xnetjs/plugins@0.7.0
  - @xnetjs/history@0.7.0
  - @xnetjs/data-bridge@0.7.0
  - @xnetjs/data@0.7.0
  - @xnetjs/storage@0.7.0
  - @xnetjs/sync@0.7.0
  - @xnetjs/identity@0.7.0
  - @xnetjs/crypto@0.7.0
  - @xnetjs/core@0.7.0

## 0.1.7

### Patch Changes

- Updated dependencies [[`6795f6b`](https://github.com/crs48/xNet/commit/6795f6b0e89c225cfa7892119ab63d6a04226b8f), [`bd50f40`](https://github.com/crs48/xNet/commit/bd50f40371ab44f22eb4f015f27d38bc8b94f025)]:
  - @xnetjs/plugins@0.6.0
  - @xnetjs/data@0.6.0
  - @xnetjs/data-bridge@0.6.0
  - @xnetjs/history@0.6.0
  - @xnetjs/storage@0.6.0
  - @xnetjs/sync@0.6.0
  - @xnetjs/identity@0.6.0
  - @xnetjs/crypto@0.6.0
  - @xnetjs/core@0.6.0

## 0.1.6

### Patch Changes

- Updated dependencies [[`bc6a088`](https://github.com/crs48/xNet/commit/bc6a088bf778e7126f305ea5af7c54764074de3c)]:
  - @xnetjs/data@0.5.0
  - @xnetjs/plugins@0.5.0
  - @xnetjs/data-bridge@0.5.0
  - @xnetjs/history@0.5.0
  - @xnetjs/storage@0.5.0
  - @xnetjs/sync@0.5.0
  - @xnetjs/identity@0.5.0
  - @xnetjs/crypto@0.5.0
  - @xnetjs/core@0.5.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`e245a3c`](https://github.com/crs48/xNet/commit/e245a3c792d4e8aa70280c9b9f0f96c213204204)]:
  - @xnetjs/data@0.4.0
  - @xnetjs/data-bridge@0.4.0
  - @xnetjs/history@0.4.0
  - @xnetjs/plugins@0.4.0
  - @xnetjs/storage@0.4.0
  - @xnetjs/sync@0.4.0
  - @xnetjs/identity@0.4.0
  - @xnetjs/crypto@0.4.0
  - @xnetjs/core@0.4.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`92708ab`](https://github.com/crs48/xNet/commit/92708ab09f2334b1ee02fef4cea654c1aed6b0ed)]:
  - @xnetjs/core@0.3.0
  - @xnetjs/data@0.3.0
  - @xnetjs/plugins@0.3.0
  - @xnetjs/crypto@0.3.0
  - @xnetjs/data-bridge@0.3.0
  - @xnetjs/history@0.3.0
  - @xnetjs/identity@0.3.0
  - @xnetjs/storage@0.3.0
  - @xnetjs/sync@0.3.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`7928202`](https://github.com/crs48/xNet/commit/792820204f71b8943f9e601f5edb3a68f86e48f5)]:
  - @xnetjs/plugins@0.2.0
  - @xnetjs/history@0.2.0
  - @xnetjs/data-bridge@0.2.0
  - @xnetjs/data@0.2.0
  - @xnetjs/storage@0.2.0
  - @xnetjs/sync@0.2.0
  - @xnetjs/identity@0.2.0
  - @xnetjs/crypto@0.2.0
  - @xnetjs/core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc), [`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc)]:
  - @xnetjs/data@0.1.2
  - @xnetjs/data-bridge@0.1.2
  - @xnetjs/history@0.1.2
  - @xnetjs/plugins@0.1.2
  - @xnetjs/storage@0.1.2
  - @xnetjs/sync@0.1.2
  - @xnetjs/identity@0.1.2
  - @xnetjs/crypto@0.1.2
  - @xnetjs/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`2ab72a9`](https://github.com/crs48/xNet/commit/2ab72a9c988122635e9610f7d7353d91e96af31d)]:
  - @xnetjs/data@0.1.1
  - @xnetjs/data-bridge@0.1.1
  - @xnetjs/storage@0.1.1
  - @xnetjs/history@0.1.1
  - @xnetjs/plugins@0.1.1
  - @xnetjs/sync@0.1.1
  - @xnetjs/identity@0.1.1
  - @xnetjs/crypto@0.1.1
  - @xnetjs/core@0.1.1

## 0.1.0

### Minor Changes

- [#278](https://github.com/crs48/xNet/pull/278) [`4aec093`](https://github.com/crs48/xNet/commit/4aec093b53647d71214b8ab05a3004b5494479d7) Thanks [@crs48](https://github.com/crs48)! - Fix the cold-start boot stall and silent registry persistence failure (exploration 0227).

  Workspace presence Y.Docs (`presence-*`) are now in-memory only — never
  cold-loaded from `yjs_state` nor persisted back — so presence-doc warming no
  longer head-of-line blocks the landing read queries on the single SQLite worker
  at boot. `NodePoolConfig` gains `isEphemeral` and `largeDocWarnBytes` options.

  The sync registry now persists its tracked-node set through a new FK-free
  app-state key/value (`getAppState`/`setAppState` on the storage adapter, backed
  by `sync_state`) instead of `yjs_state`, fixing a `SQLITE_CONSTRAINT_FOREIGNKEY`
  (787) that silently prevented the registry from ever persisting.

- [#302](https://github.com/crs48/xNet/pull/302) [`0f7e114`](https://github.com/crs48/xNet/commit/0f7e114c1471688f083c371ee39072eaf3596a19) Thanks [@crs48](https://github.com/crs48)! - Add `runAdapterConformance(makeClient)` — the executable "use xNet from any
  framework" contract. It validates the reactive data binding (immediate live-query
  snapshot then updates on mutate, no delivery after unsubscribe, one-shot fetch
  round-trip, authorization denial surfaces, idempotent `destroy()`) once,
  framework-agnostically, so a Vue/Svelte/Solid adapter only needs a thin
  render-harness test on top. Exported alongside `AdapterConformanceError` and the
  `ConformanceClientFactory` / `AdapterConformanceCheck` / `AdapterConformanceResult`
  types.

- [#365](https://github.com/crs48/xNet/pull/365) [`9e19545`](https://github.com/crs48/xNet/commit/9e19545318b1d48df7f6ef1b8bd7b472f12f1747) Thanks [@crs48](https://github.com/crs48)! - Add `createMultiHubSyncManager` plus `replication-scope` helpers (`spaceNamespace`, `systemNamespace`, `namespaceForNode`, `replicationConfigFromPolicies`) — the policy-driven selective-routing layer for multi-home sync (exploration 0258). Given a Space's namespace it consults `@xnetjs/sync`'s `planReplicationDestinations` and joins/publishes a room on only the hubs the policy selects (defaulting to a full mirror), routing over the existing multiplexed per-hub transports. Purely additive; the live single-hub path is unchanged.

### Patch Changes

- [#280](https://github.com/crs48/xNet/pull/280) [`985ac8f`](https://github.com/crs48/xNet/commit/985ac8f73ce3539e561cc03ab0c5d3b2a61d6029) Thanks [@crs48](https://github.com/crs48)! - Boot-stall diagnosis and two fixes (exploration 0229).

  `@xnetjs/sqlite`: the worker now emits boot-debug-gated diagnostics — a
  per-operation queue-wait-vs-execution timing trace and a one-shot DB-stats line
  at open (file size, page/freelist counts, storage mode). This is threaded via a
  new `bootDebug` flag on `SQLiteConfig` (the worker can't read `localStorage`). It
  separates head-of-line queueing from real SQL/OPFS cost, which finally localizes
  the recurring cold-start stall to a single operation.

  `@xnetjs/runtime`: `SyncManager` now dials the hub before loading the offline
  queue instead of after, so the WebSocket handshake is no longer serialized
  behind local storage (which, when the single SQLite worker stalls, delayed sync
  by ~18s even though the hub answers in ~200ms). The queue loads in the
  background and the connect-time drain re-runs once entries are available.

- [#360](https://github.com/crs48/xNet/pull/360) [`8e43142`](https://github.com/crs48/xNet/commit/8e43142d3cf4d958d3c0f857905a59420c7ab538) Thanks [@crs48](https://github.com/crs48)! - Change-log compaction — the durable cold-open fix (exploration 0254 / F3).

  The local `changes` log grows monotonically and never shrinks (~424k rows on affected
  workspaces), which bloats the OPFS file (slow cold SQLite open) and the first
  outbound-resync slice. Because current state is fully materialized in
  `nodes`/`node_properties` and reads never replay the log, the log is a non-authoritative
  cache of history the hub holds — so it can be safely GC'd.
  - **`@xnetjs/data`**: adds `SQLiteNodeStorageAdapter.pruneSupersededChanges(wsafe, opts)`
    and `getMinConfirmedSyncCursor()`. `pruneSupersededChanges` deletes only _superseded_
    history — rows below the confirmed-durable sync floor that are neither a node's
    hash-chain tip (kept so `getLastChange`/`parentHash` chaining is unchanged) nor the LWW
    provenance of a currently-winning property value (kept so every live value stays
    re-pushable). It runs chunked, yields between chunks, and never throws. Convergence with
    peers that never compacted is preserved by construction; only rows are deleted, never
    rewritten.
  - **`@xnetjs/runtime`**: `NodeStoreSyncProvider` now guards against a hub high-water mark
    regressing below the confirmed cursor (a hub rollback / repointed empty hub) by
    re-offering local changes from the hub's real mark.

  The web app schedules compaction on idle boot (behind the `xnet:compact:changes=off` kill
  switch); freed pages are reclaimed by the existing idle VACUUM.

- [#356](https://github.com/crs48/xNet/pull/356) [`cae9734`](https://github.com/crs48/xNet/commit/cae973482bd336de1ad0be8e557e706f01e1462e) Thanks [@crs48](https://github.com/crs48)! - Outbound resync no longer blocks the main thread for seconds on cold open (exploration 0253).

  When the persisted sync cursor lags far behind the local change log (e.g. the hub never
  confirmed the tail — INVALID_HASH skew), `syncLocalChanges()` fetched every change since the
  cursor and processed the whole slice synchronously right after the sync-response resolved — the
  single ~5s uninterrupted main-thread long task seen in cold-open captures. Two fixes:
  - The equal-lamport tie-break now uses **code-unit** order instead of `String.localeCompare`,
    which is orders of magnitude faster over a large tie-heavy slice and matches the code-unit
    collation the inbound apply path already uses (the query already returns lamport-ASC order, so
    this only orders ties).
  - The enqueue loop **yields to the event loop** every 1024 changes, so a large first-sync slice
    can no longer monopolise a frame regardless of size.

  A one-line self-gating `[NodeStoreSync] heavy outbound resync` diagnostic names the residual
  synchronous cost (the per-row deserialize inside `getChangesSince`) when a resync is large, to
  size the durable fix (compacting the change log). No public API or wire-contract change.

- [#366](https://github.com/crs48/xNet/pull/366) [`237a67c`](https://github.com/crs48/xNet/commit/237a67c0f2d583fca11795b76f83e75718285ee5) Thanks [@crs48](https://github.com/crs48)! - Rollback re-offer no longer floods a reset or protocol-skewed hub (exploration 0260).

  `NodeStoreSyncProvider`'s rollback guard now skips re-offering local changes when the
  hub reports `highWaterMark === 0` (a fresh/empty/reset hub, not a recoverable partial
  rollback — re-offering there re-pushed the entire change log via `getChangesSince(0)`)
  or when the outbound `INVALID_HASH` breaker is already tripped (every re-offered change
  would be rejected identically). A genuine partial rollback (`0 < highWaterMark <
cursor`) still re-offers the gap.

- Updated dependencies [[`f626e50`](https://github.com/crs48/xNet/commit/f626e50c003e196de8dee7b3a49c4fd98df85f35), [`df76bef`](https://github.com/crs48/xNet/commit/df76bef06bbd700998b29bf1bd25658d8ae759e3), [`acbf801`](https://github.com/crs48/xNet/commit/acbf801aeec7f958bd953a9f3d98cc355a0387db), [`4658b8f`](https://github.com/crs48/xNet/commit/4658b8f1ac27af01f89b883cf6c1e5d10d2c8161), [`4aec093`](https://github.com/crs48/xNet/commit/4aec093b53647d71214b8ab05a3004b5494479d7), [`8e43142`](https://github.com/crs48/xNet/commit/8e43142d3cf4d958d3c0f857905a59420c7ab538), [`37d4462`](https://github.com/crs48/xNet/commit/37d4462105cc87d6b9e2647ca0eaeba7442d2702), [`e531d0d`](https://github.com/crs48/xNet/commit/e531d0dec9201d2649f9bcaf1392ab1a2186fe47), [`4fb460a`](https://github.com/crs48/xNet/commit/4fb460a24061f818d3f99a166876d9cd1b3d7544), [`1a44c5d`](https://github.com/crs48/xNet/commit/1a44c5decb087cfbf44e152d811a51f953893036), [`2a638ec`](https://github.com/crs48/xNet/commit/2a638ec81145eb89f156ca5275227412680df898), [`70b7e07`](https://github.com/crs48/xNet/commit/70b7e0778a7da2a74e2de637691ff71531e3faf2), [`d7a87da`](https://github.com/crs48/xNet/commit/d7a87daf84ea86d6d26eed3fd61314a60e1d7cbf), [`fc3aa1d`](https://github.com/crs48/xNet/commit/fc3aa1dba2cf40844ca38f7cc816cddc981d9022), [`5da8d92`](https://github.com/crs48/xNet/commit/5da8d9206797183c69dc7c4f3aae3e1d9cec2e5a), [`3c8a6a6`](https://github.com/crs48/xNet/commit/3c8a6a61c56eadc8f0b8657ce8a241981f7e7dc4), [`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4), [`b327f99`](https://github.com/crs48/xNet/commit/b327f99a9448ce8724c09c66058e8e1daadd44bf), [`7d01fd6`](https://github.com/crs48/xNet/commit/7d01fd62ae7293eaf5d30f43bf24d0aa6648762b), [`ddf47b9`](https://github.com/crs48/xNet/commit/ddf47b9cac403b6ff452f47e1a4a9065f393ac1c)]:
  - @xnetjs/data@0.1.0
  - @xnetjs/plugins@0.1.0
  - @xnetjs/identity@0.1.0
  - @xnetjs/data-bridge@0.1.0
  - @xnetjs/core@0.1.0
  - @xnetjs/history@0.1.0
  - @xnetjs/storage@0.1.0
  - @xnetjs/sync@0.1.0
  - @xnetjs/crypto@0.1.0

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @xnetjs/plugins@0.0.3
  - @xnetjs/history@0.0.3
  - @xnetjs/data-bridge@0.0.3
  - @xnetjs/data@0.0.3
  - @xnetjs/storage@0.0.3
  - @xnetjs/sync@0.0.3
  - @xnetjs/identity@0.0.3
  - @xnetjs/crypto@0.0.3
  - @xnetjs/core@0.0.3
