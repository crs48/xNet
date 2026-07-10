# @xnetjs/data-bridge

## 0.10.0

### Patch Changes

- Updated dependencies [[`0721fd5`](https://github.com/crs48/xNet/commit/0721fd5d263abd3242a3b10cf827fa552cbacbb7)]:
  - @xnetjs/data@0.10.0
  - @xnetjs/sqlite@0.10.0
  - @xnetjs/sync@0.10.0
  - @xnetjs/core@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [[`8955613`](https://github.com/crs48/xNet/commit/8955613cea6a27af0d5cbe483bbd66b202f2dc25), [`8bb9cc6`](https://github.com/crs48/xNet/commit/8bb9cc6752cfe0a83d91388bdc375ff03f55b852)]:
  - @xnetjs/sync@0.9.0
  - @xnetjs/data@0.9.0
  - @xnetjs/sqlite@0.9.0
  - @xnetjs/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.8.0
  - @xnetjs/sqlite@0.8.0
  - @xnetjs/sync@0.8.0
  - @xnetjs/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.7.0
  - @xnetjs/sqlite@0.7.0
  - @xnetjs/sync@0.7.0
  - @xnetjs/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`bd50f40`](https://github.com/crs48/xNet/commit/bd50f40371ab44f22eb4f015f27d38bc8b94f025)]:
  - @xnetjs/data@0.6.0
  - @xnetjs/sqlite@0.6.0
  - @xnetjs/sync@0.6.0
  - @xnetjs/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`bc6a088`](https://github.com/crs48/xNet/commit/bc6a088bf778e7126f305ea5af7c54764074de3c)]:
  - @xnetjs/data@0.5.0
  - @xnetjs/sqlite@0.5.0
  - @xnetjs/sync@0.5.0
  - @xnetjs/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`e245a3c`](https://github.com/crs48/xNet/commit/e245a3c792d4e8aa70280c9b9f0f96c213204204)]:
  - @xnetjs/data@0.4.0
  - @xnetjs/sqlite@0.4.0
  - @xnetjs/sync@0.4.0
  - @xnetjs/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`92708ab`](https://github.com/crs48/xNet/commit/92708ab09f2334b1ee02fef4cea654c1aed6b0ed)]:
  - @xnetjs/core@0.3.0
  - @xnetjs/data@0.3.0
  - @xnetjs/sync@0.3.0
  - @xnetjs/sqlite@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.2.0
  - @xnetjs/sqlite@0.2.0
  - @xnetjs/sync@0.2.0
  - @xnetjs/core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc), [`1a045b3`](https://github.com/crs48/xNet/commit/1a045b371b4d8fabe7cd32c5bc44d03efd6c31cc)]:
  - @xnetjs/data@0.1.2
  - @xnetjs/sqlite@0.1.2
  - @xnetjs/sync@0.1.2
  - @xnetjs/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`2ab72a9`](https://github.com/crs48/xNet/commit/2ab72a9c988122635e9610f7d7353d91e96af31d)]:
  - @xnetjs/sqlite@0.1.1
  - @xnetjs/data@0.1.1
  - @xnetjs/sync@0.1.1
  - @xnetjs/core@0.1.1

## 0.1.0

### Minor Changes

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

- Updated dependencies [[`f626e50`](https://github.com/crs48/xNet/commit/f626e50c003e196de8dee7b3a49c4fd98df85f35), [`df76bef`](https://github.com/crs48/xNet/commit/df76bef06bbd700998b29bf1bd25658d8ae759e3), [`4658b8f`](https://github.com/crs48/xNet/commit/4658b8f1ac27af01f89b883cf6c1e5d10d2c8161), [`985ac8f`](https://github.com/crs48/xNet/commit/985ac8f73ce3539e561cc03ab0c5d3b2a61d6029), [`4aec093`](https://github.com/crs48/xNet/commit/4aec093b53647d71214b8ab05a3004b5494479d7), [`8e43142`](https://github.com/crs48/xNet/commit/8e43142d3cf4d958d3c0f857905a59420c7ab538), [`37d4462`](https://github.com/crs48/xNet/commit/37d4462105cc87d6b9e2647ca0eaeba7442d2702), [`d4bfe27`](https://github.com/crs48/xNet/commit/d4bfe2775d80d28afec11799edd911b9529c8bfe), [`e531d0d`](https://github.com/crs48/xNet/commit/e531d0dec9201d2649f9bcaf1392ab1a2186fe47), [`22ab91d`](https://github.com/crs48/xNet/commit/22ab91dc3e979446a87e84fbf0a8258276c309f0), [`b320a06`](https://github.com/crs48/xNet/commit/b320a062c1d4485e2756fae87cad5a016d4eb5ed), [`7e6f5b7`](https://github.com/crs48/xNet/commit/7e6f5b73b6dfad38d645d0be25cd11670211e999), [`70b7e07`](https://github.com/crs48/xNet/commit/70b7e0778a7da2a74e2de637691ff71531e3faf2), [`3261a75`](https://github.com/crs48/xNet/commit/3261a7500df87f5c24baba2d0f6f389f7ff8ebf7), [`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4), [`b0cd77c`](https://github.com/crs48/xNet/commit/b0cd77c2612f1a6540ead9e4edb9916b6d09cb66), [`142b1c0`](https://github.com/crs48/xNet/commit/142b1c05d80f5f7fe46ed80cd5bafc0fe9c14630), [`0e0802d`](https://github.com/crs48/xNet/commit/0e0802dc22a64703ca54168a4a731cd1d34a54bf), [`839b2b7`](https://github.com/crs48/xNet/commit/839b2b73373ea774438fbf624690eae3d368ceab), [`d9008d2`](https://github.com/crs48/xNet/commit/d9008d2f2332129b367746ae7991be144fb7d8e1), [`7d01fd6`](https://github.com/crs48/xNet/commit/7d01fd62ae7293eaf5d30f43bf24d0aa6648762b)]:
  - @xnetjs/data@0.1.0
  - @xnetjs/sqlite@0.1.0
  - @xnetjs/core@0.1.0
  - @xnetjs/sync@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @xnetjs/data@0.0.3
  - @xnetjs/sqlite@0.0.3
  - @xnetjs/sync@0.0.3
  - @xnetjs/core@0.0.3

## 0.0.2

### Patch Changes

- cd2a564: Set up automated npm publishing via Changesets and GitHub Actions trusted publishing, and standardize package publish metadata (public access, provenance, files, and dist entrypoints) for the initial @xnetjs release set including the React package chain.
- Updated dependencies [cd2a564]
  - @xnetjs/core@0.0.2
  - @xnetjs/data@0.0.2
