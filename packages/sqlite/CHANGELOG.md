# @xnetjs/sqlite

## 0.12.0

## 0.11.1

## 0.11.0

## 0.10.0

## 0.9.0

## 0.8.0

## 0.7.0

## 0.6.0

## 0.5.0

## 0.4.0

## 0.3.0

## 0.2.0

## 0.1.2

### Patch Changes

- [#392](https://github.com/crs48/xNet/pull/392) [`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc) Thanks [@crs48](https://github.com/crs48)! - SQL property upserts now enforce the full LWW ordering triple (Lamport →
  wallTime → author code-units), matching the in-memory `shouldReplace`
  comparator. The previous lamport-only guard let arrival order decide
  same-Lamport concurrent edits, so two replicas that received the same
  conflicting changes in different orders could permanently disagree on the
  materialized value. Applies to the per-change upsert, the batched
  `applyNodeBatch` path, and the native web/electron batch adapters.

## 0.1.1

### Patch Changes

- [#388](https://github.com/crs48/xNet/pull/388) [`2ab72a9`](https://github.com/crs48/xNet/commit/2ab72a9c988122635e9610f7d7353d91e96af31d) Thanks [@crs48](https://github.com/crs48)! - Query-plan debug diagnostics no longer convoy the SQLite worker. With
  `xnet:query:debug` enabled, every query used to issue EXPLAIN QUERY PLAN +
  PRAGMA schema_version + one PRAGMA index_info per index as separate serial
  worker round-trips — hundreds per boot, delaying real query results by
  18-20s. `getIndexInfo` now dedupes concurrent callers onto one in-flight
  build and fetches all index metadata in a single batched
  `pragma_index_info` join (with a per-index fallback for runtimes without
  table-valued pragmas), and the storage adapter collects plan diagnostics
  once per unique compiled SQL shape per session instead of per execution
  (invalidated when adaptive indexes are created or dropped).

## 0.1.0

### Minor Changes

- [#277](https://github.com/crs48/xNet/pull/277) [`4658b8f`](https://github.com/crs48/xNet/commit/4658b8f1ac27af01f89b883cf6c1e5d10d2c8161) Thanks [@crs48](https://github.com/crs48)! - Materialized views can now coexist with read authorization. Each
  materialization is stamped with a reload-stable authorization fingerprint
  (subject + grant-state version), so a view is authorized once at refresh and
  served from the persisted cache without per-row re-checks — while any grant
  change forces an `authz-changed` re-materialization. The cached id list can
  never serve a row a revoked viewer may no longer read. Adds a nullable
  `auth_fingerprint` column to `node_query_materializations` (schema v7, applied
  to existing databases via a defensive column guard) plus optional
  `setNodeReadAuthorizer` / `getAuthorizationStateVersion` storage-adapter seams.

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

- [#282](https://github.com/crs48/xNet/pull/282) [`d4bfe27`](https://github.com/crs48/xNet/commit/d4bfe2775d80d28afec11799edd911b9529c8bfe) Thanks [@crs48](https://github.com/crs48)! - Add parallel SQLite reads to the Electron `better-sqlite3` adapter (exploration
  0230). Unlike the browser — where `opfs-sahpool` holds an exclusive handle so a
  second connection is impossible — native SQLite + WAL allows one writer
  concurrent with many readers, each on its own connection. The adapter now:
  - fronts the writer with the shared priority scheduler (`scheduler` config,
    default on) so a write/import burst can't head-of-line block an interactive
    read;
  - optionally opens a read-only secondary connection (`readonlyReadConnection`)
    so plain reads don't contend with write locks;
  - optionally spawns a pool of read-only `worker_threads` readers
    (`readerPoolSize`, `'auto'` sizes to the host) that serve **heavy** reads
    (FTS, aggregates, large scans) in parallel on other cores, with least-busy
    dispatch and graceful fallback to the inline connection;
  - yields cooperatively between chunks in `applyNodeBatch` so a long import no
    longer monopolizes the data-process thread;
  - exposes `getDiagnostics()` / `getWalStats()` / `checkpointWal()` plus a
    read-your-writes window (`readYourWritesWindowMs`).

  All additive — existing callers are unaffected, and the new behaviour is
  opt-in via config (the scheduler is on by default but only reorders
  non-transactional work).

- [#381](https://github.com/crs48/xNet/pull/381) [`b320a06`](https://github.com/crs48/xNet/commit/b320a062c1d4485e2756fae87cad5a016d4eb5ed) Thanks [@crs48](https://github.com/crs48)! - Add `incrementalVacuum(maxPages?)` to `SQLiteAdapter` (optional method) and
  implement it on the web (WASM) and Electron adapters. On the WASM build,
  `exec('PRAGMA incremental_vacuum')` silently frees only ONE page per call —
  SQLite frees a single freelist page per `sqlite3_step` of that pragma and the
  oo1 `exec` path steps a row-less statement exactly once — so the change-log
  compaction's per-boot file reclaim was a near-no-op. The new method steps the
  pragma to completion (optionally capped) and returns the number of pages freed.

- [#307](https://github.com/crs48/xNet/pull/307) [`7e6f5b7`](https://github.com/crs48/xNet/commit/7e6f5b73b6dfad38d645d0be25cd11670211e999) Thanks [@crs48](https://github.com/crs48)! - Add OPFS capability detection so the storage layer can pick and explain its
  durable backend before opening — `detectOpfsCapability()`, plus the
  `supportsOpfs`, `supportsSyncAccessHandle`, and `isCrossOriginIsolated`
  predicates and the `OpfsCapability` / `OpfsPersistenceMode` types. The web
  adapter uses it to emit an accurate diagnostic when synchronous access handles
  are unavailable (iOS 15.2–16.3 / older WebViews) — it falls back to the async
  OPFS backend, which is still durable, rather than logging a misleading error.
  This makes the mobile-webview hosting path (exploration 0238) legible: hosts can
  branch on capability and target the right minimum OS.

- [#355](https://github.com/crs48/xNet/pull/355) [`3261a75`](https://github.com/crs48/xNet/commit/3261a7500df87f5c24baba2d0f6f389f7ff8ebf7) Thanks [@crs48](https://github.com/crs48)! - Web SQLite `open()` now retries on timeout instead of hard-failing the boot (exploration 0253).

  A cold `installOpfsSAHPoolVfs()` on a large database file intermittently exceeds the 15s
  open timeout — most often because a _prior_ boot's open timed out and leaked a worker still
  holding the file's exclusive OPFS sync access handle, so the next boot's
  `createSyncAccessHandle()` blocks on the contended handle. Previously the first timeout threw
  ("Initialization failed: Worker initialization timeout after 15s") and showed an error screen.

  `WebSQLiteProxy.open()` now terminates the stuck worker (releasing the handle) and retries with
  a fresh worker up to 3 attempts via the new `openWithTimeoutRetry` helper, so the leaked-handle
  cascade recovers instead of failing. A genuinely broken/unavailable OPFS still fails cleanly
  after the bounded attempts. Adds `SQLiteConfig.openTimeoutMs` (default 15000) to tune the
  per-attempt timeout.

- [#351](https://github.com/crs48/xNet/pull/351) [`839b2b7`](https://github.com/crs48/xNet/commit/839b2b73373ea774438fbf624690eae3d368ceab) Thanks [@crs48](https://github.com/crs48)! - Cold-open boot diagnostics: bracket the SQLite worker's open/init window (exploration 0253).

  The 7th cold-open capture showed the ~17 s stall with `execMs: 0` AND `queueMs: 0` on
  every op — so it is neither slow SQL nor scheduler head-of-line blocking. The cost moved
  into the one window no timer brackets: the worker's `open()`/init and the dispatch gap
  before the first scheduled op. This adds the two missing log lines (gated behind
  `bootDebug`, never throws):
  - `WebSQLiteAdapter` now records per-phase open timings (`OpenPhaseTimings`:
    wasm import/init, OPFS VFS install incl. lock retries, capacity reserve, db open,
    pragmas, total) exposed via `getOpenPhaseTimings()`, plus public `schemaApplyMs` and
    `openRetryAttempts`. The worker host emits them as `[xNet] sqlite open phases`.
  - `SchedulerOpReport` gains `enqueuedAt` + `startedAt` so the worker host can tag the
    FIRST op after open with `idleBeforeFirstOpMs` (open → first enqueue, the upstream/
    transport wait) and `sinceOpenMs` (open → first exec) — the disambiguator between
    "stalled in open" and "stalled upstream".

  Diagnostic only; no behaviour change on the production path.

- [#279](https://github.com/crs48/xNet/pull/279) [`d9008d2`](https://github.com/crs48/xNet/commit/d9008d2f2332129b367746ae7991be144fb7d8e1) Thanks [@crs48](https://github.com/crs48)! - Add a priority scheduler with read coalescing to the web SQLite worker
  (exploration 0228). All storage operations now drain through one scheduler
  inside the single worker both the main thread and data worker share:
  interactive reads are served ahead of queued writes, so a write or sync-apply
  burst can no longer starve a read (generalizing the 0227 head-of-line fix).
  Identical concurrent reads collapse into a single execution. A new
  `getSchedulerSnapshot()` exposes queue depth for diagnostics. This is ordering
  only — no parallelism is added, since `opfs-sahpool` is single-connection by
  construction.

- [#382](https://github.com/crs48/xNet/pull/382) [`7d01fd6`](https://github.com/crs48/xNet/commit/7d01fd62ae7293eaf5d30f43bf24d0aa6648762b) Thanks [@crs48](https://github.com/crs48)! - SQLite worker-queue upgrades from the local-first field survey (exploration 0263).

  **@xnetjs/sqlite** — multi-tab leadership: tabs now elect a leader via Web Locks
  (`navigator.locks`) and other tabs route storage RPCs to the leader's SQLite
  worker through a SharedWorker port ferry, instead of the second tab silently
  falling back to a non-durable `:memory:` database. Leader death promotes a
  follower (in-flight follower calls reject immediately; idempotent reads retry
  automatically); abandoned manual transactions roll back on the next client
  connect; `multiTab: false` opts out and unsupported browsers keep the previous
  per-tab behaviour. Also new: a prepared-statement LRU on the web adapter's hot
  path (replacing per-call `db.exec` parsing), a `queryBatch(reads[])` adapter/
  RPC API that executes several reads in one worker round-trip, per-lane
  scheduler latency stats (`getSchedulerOpStats()`: queue/exec p50/p95, coalesce
  hits), and `:memory:`-fallback session counters.

  **@xnetjs/data-bridge** — read-set-scoped invalidation (store changes for
  schemas no cached query observes are dropped before any delta work), bulk
  changes now reload only subscribed entries while unwatched entries serve
  stale-while-revalidate, and `QueryCache` gains row-weight-aware eviction
  (200 entries / 50k cached rows) plus hit/miss/eviction stats via
  `getQueryCacheStats()`.

  **@xnetjs/data** — `getNode()` collapses to one joined query (was two worker
  round-trips) and multi-chunk node hydrates ride a single `queryBatch` RPC.

### Patch Changes

- [#369](https://github.com/crs48/xNet/pull/369) [`22ab91d`](https://github.com/crs48/xNet/commit/22ab91dc3e979446a87e84fbf0a8258276c309f0) Thanks [@crs48](https://github.com/crs48)! - OPFS databases now open with `PRAGMA auto_vacuum = INCREMENTAL` (exploration 0260).

  Change-log compaction (0254) DELETEs superseded history, but under the previous
  default `auto_vacuum = NONE` those pages only returned to SQLite's freelist — the
  OPFS file never shrank, so the cold-open read that faults the file's working set
  stayed bloat-priced no matter how much history was pruned. INCREMENTAL mode lets
  each compaction pass call `PRAGMA incremental_vacuum` to hand the freed pages back
  to the filesystem, so the file shrinks a little every idle boot until the log is
  drained. The mode only converts on a fresh database or at a `VACUUM`; the existing
  one-time boot-settled VACUUM performs that conversion for pre-existing databases,
  after which no further whole-file rewrite is needed. Fresh databases are created in
  incremental mode and never bloat.

- [#384](https://github.com/crs48/xNet/pull/384) [`70b7e07`](https://github.com/crs48/xNet/commit/70b7e0778a7da2a74e2de637691ff71531e3faf2) Thanks [@crs48](https://github.com/crs48)! - Query-model read-speed upgrades (exploration 0264).

  **@xnetjs/data** — hydration now aggregates in SQL (`json_group_object`,
  one row per node instead of one per node×property; default ON,
  `aggregatedHydration: false` opts out) — benchmarked on the real WASM build
  at 8× fewer boundary rows, 4.9× faster hydrate SQL, and 4.5× faster
  end-to-end; pushed-down queries fuse the candidate select and hydrate into
  ONE statement (with `COUNT(*) OVER ()` folding `count: 'exact'` in);
  id-list SQL pads to fixed arity buckets so the worker's prepared-statement
  cache actually hits; adaptive indexing can defer index creation to an idle
  `scheduleMaintenance` hook; and with adaptive indexing enabled, a single
  custom-property sort now pushes down to SQL pagination (one page hydrated
  instead of the whole schema).

  **@xnetjs/data-bridge** — new warm-start snapshot seam on the main-thread
  bridge: `exportQuerySnapshots()` / `seedQuerySnapshots()` persist and
  re-seed loaded query results as stale entries that render instantly while
  the live query revalidates.

  **@xnetjs/sqlite** — query-planner statistics hygiene: `analysis_limit` +
  `PRAGMA optimize=0x10002` at open (web and electron), enabling skip-scan
  and informed index choice on long-lived connections.

  **@xnetjs/react** — exports `useDataBridge`.

- [#288](https://github.com/crs48/xNet/pull/288) [`b0cd77c`](https://github.com/crs48/xNet/commit/b0cd77c2612f1a6540ead9e4edb9916b6d09cb66) Thanks [@crs48](https://github.com/crs48)! - Forward the SQLite Web Worker's boot-debug diagnostics to the main thread so the
  in-app Logs panel captures them (exploration 0229). The per-op queue/exec timing
  (`[xNet] sqlite op`) and one-shot DB stats (`[xNet] db stats @ open`) were
  emitted only in the dedicated worker's console, which the main-thread console tap
  never sees — so every boot-stall capture/export came back missing exactly those
  lines. The worker now `postMessage`s each boot-debug line (under a dedicated
  discriminator key that can't collide with Comlink RPC) and `WebSQLiteProxy`
  re-emits it on the main console. Gated by `xnet:boot:debug`; no effect on normal
  operation.

- [#290](https://github.com/crs48/xNet/pull/290) [`142b1c0`](https://github.com/crs48/xNet/commit/142b1c05d80f5f7fe46ed80cd5bafc0fe9c14630) Thanks [@crs48](https://github.com/crs48)! - Memory-map OPFS reads (`PRAGMA mmap_size`) on the web adapter so the first cold
  query after a reload faults its working-set pages via the OS instead of
  thousands of synchronous 8 KiB reads on the single worker thread (exploration
  0233). The boot trace caught one cold landing query taking 15.8 s of pure
  execution while every later warm query was 0 ms — the page cache only helps
  re-reads, so mmap is the lever for the first read. Guarded: a no-op where the
  `opfs-sahpool` VFS doesn't support it.

- [#345](https://github.com/crs48/xNet/pull/345) [`0e0802d`](https://github.com/crs48/xNet/commit/0e0802dc22a64703ca54168a4a731cd1d34a54bf) Thanks [@crs48](https://github.com/crs48)! - Boot diagnostics: name every scheduled SQLite op in the boot log (exploration
  0249). The `WorkerScheduler` op report gains an optional `detail` field and
  `schedule()` an optional `detail` argument; the web worker now forwards each
  read/write op's whitespace-collapsed, **param-free** SQL text so a long `execMs`
  line names the exact statement instead of the generic `query` label. This is the
  missing field that kept the ~15 s cold-open stall unidentified across
  explorations 0227–0233. Additive and backward compatible — `detail` is optional
  and only emitted when boot debug (`xnet:boot:debug`) is on.

## 0.0.3

## 0.0.2

### Patch Changes

- cd2a564: Set up automated npm publishing via Changesets and GitHub Actions trusted publishing, and standardize package publish metadata (public access, provenance, files, and dist entrypoints) for the initial @xnetjs release set including the React package chain.
