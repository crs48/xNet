# @xnetjs/runtime

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

- Updated dependencies [[`f626e50`](https://github.com/crs48/xNet/commit/f626e50c003e196de8dee7b3a49c4fd98df85f35), [`df76bef`](https://github.com/crs48/xNet/commit/df76bef06bbd700998b29bf1bd25658d8ae759e3), [`acbf801`](https://github.com/crs48/xNet/commit/acbf801aeec7f958bd953a9f3d98cc355a0387db), [`4658b8f`](https://github.com/crs48/xNet/commit/4658b8f1ac27af01f89b883cf6c1e5d10d2c8161), [`4aec093`](https://github.com/crs48/xNet/commit/4aec093b53647d71214b8ab05a3004b5494479d7), [`37d4462`](https://github.com/crs48/xNet/commit/37d4462105cc87d6b9e2647ca0eaeba7442d2702), [`e531d0d`](https://github.com/crs48/xNet/commit/e531d0dec9201d2649f9bcaf1392ab1a2186fe47), [`4fb460a`](https://github.com/crs48/xNet/commit/4fb460a24061f818d3f99a166876d9cd1b3d7544), [`1a44c5d`](https://github.com/crs48/xNet/commit/1a44c5decb087cfbf44e152d811a51f953893036), [`2a638ec`](https://github.com/crs48/xNet/commit/2a638ec81145eb89f156ca5275227412680df898), [`d7a87da`](https://github.com/crs48/xNet/commit/d7a87daf84ea86d6d26eed3fd61314a60e1d7cbf), [`fc3aa1d`](https://github.com/crs48/xNet/commit/fc3aa1dba2cf40844ca38f7cc816cddc981d9022), [`5da8d92`](https://github.com/crs48/xNet/commit/5da8d9206797183c69dc7c4f3aae3e1d9cec2e5a), [`3c8a6a6`](https://github.com/crs48/xNet/commit/3c8a6a61c56eadc8f0b8657ce8a241981f7e7dc4), [`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4), [`b327f99`](https://github.com/crs48/xNet/commit/b327f99a9448ce8724c09c66058e8e1daadd44bf), [`ddf47b9`](https://github.com/crs48/xNet/commit/ddf47b9cac403b6ff452f47e1a4a9065f393ac1c)]:
  - @xnetjs/data@0.1.0
  - @xnetjs/plugins@0.1.0
  - @xnetjs/identity@0.1.0
  - @xnetjs/core@0.1.0
  - @xnetjs/data-bridge@0.1.0
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
