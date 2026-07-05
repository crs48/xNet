---
'@xnetjs/sqlite': minor
'@xnetjs/data-bridge': minor
'@xnetjs/data': patch
---

SQLite worker-queue upgrades from the local-first field survey (exploration 0263).

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
