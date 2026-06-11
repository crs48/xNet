# Query And Mutation Hot Path Performance

## Problem Statement

`useQuery` and `useMutate` are the highest-traffic APIs in xNet. Every list,
sidebar, grid cell, task row, and canvas widget reads through
`useQuery` → DataBridge → QueryCache → NodeStore → SQLite, and every edit
writes back through the mirror path. As node counts and active-query counts
grow, interactions that should be sub-millisecond (toggling a checkbox,
typing in a cell) trigger cascading full re-queries, redundant verification
scans, and app-wide re-renders.

This exploration traces the actual hot paths as they exist today, measures
them, ranks the bottlenecks by impact, and recommends a phased plan to
dramatically improve interactive performance.

## Executive Summary

The single most expensive behavior in the platform today is **invalidation
by re-execution**: any query with `limit`, `offset`, or a cursor (which
includes every paginated list — the documented, recommended pattern) is
fully re-run against storage on _every_ matching node change
([query.ts:709](../../packages/data/src/store/query.ts) →
`nodeQueryDescriptorNeedsBoundedReload`). The always-mounted Sidebar alone
holds three such queries, so a single keystroke that updates a page title
re-queries SQLite three times.

The second most expensive behavior is **hidden per-query overhead in the
SQLite adapter**: with default options, every compiled query also runs a
parity audit that re-lists the _entire schema_ and re-executes the query in
JS for comparison (`DEFAULT_QUERY_VERIFICATION.enabled = true`,
[sqlite-adapter.ts:277](../../packages/data/src/store/sqlite-adapter.ts)),
plus an `EXPLAIN QUERY PLAN`, an index enumeration, and a telemetry
**write** (`INSERT ... ON CONFLICT`) — per read.

Third: **the React layer destroys object identity on every update**.
`flattenNodes` rebuilds every `FlatNode` on each notification, and
`QueryCache.set` notifies subscribers unconditionally with no equality
check, so memoized children re-render even when their data did not change.

Measured on this machine (M-series, Node 23, memory adapter — browser adds
a Comlink worker hop per storage call):

| Metric                           |       Value | Meaning                                             |
| -------------------------------- | ----------: | --------------------------------------------------- |
| `query-update-fanout-10000`      | **5.94 ms** | one update, ONE subscribed bounded query, 10k nodes |
| `query-update-fanout-1000`       |     1.39 ms | same at 1k nodes (scales ~linearly)                 |
| `database-create-row`            |     5.59 ms | single row create end-to-end                        |
| canonicalize+blake3+Ed25519 sign |     0.37 ms | per change, main thread                             |
| flatten 1000-node list           |     0.53 ms | per subscriber, per notification                    |
| descriptor build + serialize     |       ~1 µs | per `useQuery` render (negligible)                  |
| structuredClone (20-prop node)   |       ~3 µs | negligible                                          |

A 60 fps frame budget is 16 ms. One update against one 10k-node bounded
query already burns 37% of a frame _before_ React renders anything — and
real screens hold 5–15 active queries.

The recommendation, in one line: **make changes flow _through_ cached
results instead of re-executing queries, and make identical data produce
identical object identities.** Concretely: (1) gate the per-query
audit/diagnostics behind a debug flag, (2) extend incremental delta
application to bounded queries with an overfetch buffer, (3) add structural
sharing + per-node flatten caching in the React layer, (4) coalesce the
7-round-trip write path, and (5) finish the worker-bridge story so the main
thread only receives final snapshots.

## Current State In The Repository

### Architecture map

```mermaid
flowchart TD
    subgraph React["packages/react"]
        UQ["useQuery.ts<br/>(descriptor + uSES + flatten)"]
        UM["useMutate.ts<br/>(create/update/remove/bulk)"]
        UC["useCell / useDatabaseRow / useNode<br/>(direct store.subscribe per cell/row)"]
    end
    subgraph Bridge["packages/data-bridge"]
        MTB["MainThreadBridge<br/>(production default)"]
        QC["QueryCache<br/>(Map keyed by serialized descriptor)"]
        QD["query-descriptor.ts<br/>applyNodeChangeToQueryResult"]
        WB["WorkerBridge<br/>(exists, not wired by default)"]
    end
    subgraph Data["packages/data"]
        NS["NodeStore (store.ts)<br/>sign + auth + change log"]
        QSem["store/query.ts<br/>descriptor semantics"]
        SQA["SQLiteNodeStorageAdapter<br/>(sqlite-adapter.ts, 3.6k lines)"]
    end
    subgraph Workers["apps/web"]
        PROXY["WebSQLiteProxy<br/>(Comlink postMessage)"]
        SW["SQLite worker (OPFS)"]
    end

    UQ -->|"bridge.query()"| MTB
    UM -->|"bridge.create/update"| MTB
    UC -.->|"bypasses bridge cache"| NS
    MTB --> QC
    MTB -->|"store.query / store.update"| NS
    MTB --> QD
    NS --> SQA
    SQA --> PROXY
    PROXY -->|postMessage| SW
    NS -->|"emit(change)"| MTB
```

Production wiring ([context.ts:603](../../packages/react/src/context.ts),
[App.tsx:457-480](../../apps/web/src/App.tsx)): `NodeStore` runs on the
**main thread** with no auth evaluator and no content cipher; storage is
`SQLiteNodeStorageAdapter` over `WebSQLiteProxy`, so **every storage call
is an async postMessage round trip** to the SQLite worker. The
`MainThreadBridge` is the default bridge
([context.ts:141](../../packages/react/src/context.ts)); `WorkerBridge`
and `worker/data-worker.ts` exist but are not the default path.

### Read path anatomy (useQuery)

[useQuery.ts](../../packages/react/src/hooks/useQuery.ts) per render:

1. Builds a canonical descriptor and serializes it
   (`createQueryDescriptor` + `JSON.stringify`). With the dominant calling
   convention — inline filter literals, e.g.
   [Sidebar.tsx:81](../../apps/web/src/components/Sidebar.tsx),
   [useGridDatabase.ts:229-250](../../packages/react/src/hooks/useGridDatabase.ts)
   — the filter object identity changes every render, so the descriptor
   memo recomputes every render. **Measured at ~1 µs, this is noise** —
   but the unstable `descriptor`/`filter` identities also churn the
   `reload` callback and `pageInfo` memo downstream.
2. Subscribes via `useSyncExternalStore` against a `QueryCache` entry
   shared across components by serialized-descriptor key (good
   deduplication, [query-cache.ts:174](../../packages/data-bridge/src/query-cache.ts)).
3. On every snapshot change, re-flattens the **entire** result list
   (`flattenNodes`, [useQuery.ts:390](../../packages/react/src/hooks/useQuery.ts)) —
   every node gets a brand-new object identity, in every subscribed
   component, regardless of which node changed.
4. Reads `subscription.getMetadata?.()` outside the subscription contract
   ([useQuery.ts:357](../../packages/react/src/hooks/useQuery.ts)) — a
   metadata-only `setMetadata` notification re-runs render via notify, but
   if `getSnapshot` identity is unchanged React bails out and the metadata
   update is silently dropped.

### Query execution anatomy (NodeStore → SQLite)

[store.ts:617](../../packages/data/src/store/store.ts) `query()`:

- **Pushdown path** (no cipher, no auth evaluator — the production case):
  delegates to `SQLiteNodeStorageAdapter.queryNodes`
  ([sqlite-adapter.ts:882](../../packages/data/src/store/sqlite-adapter.ts)).
  This path is well-built (compile to SQL → select ids → batched
  hydration), **but per call it also runs, with default options**:
  - `auditQueryParity` ([sqlite-adapter.ts:2816](../../packages/data/src/store/sqlite-adapter.ts)):
    for schemas ≤ 1000 nodes (`DEFAULT_QUERY_VERIFICATION = { enabled:
true, maxNodes: 1000 }`), it `countNodes`, **lists the entire schema**,
    re-applies the descriptor in JS, and diffs the two result sets. The
    optimized path executes the slow path too, on every query.
  - `collectCompiledQueryDiagnostics`
    ([sqlite-adapter.ts:2746](../../packages/data/src/store/sqlite-adapter.ts)):
    `EXPLAIN QUERY PLAN` + full index enumeration, per query.
  - `recordQueryTelemetry` ([sqlite-adapter.ts:2674](../../packages/data/src/store/sqlite-adapter.ts)):
    an `INSERT ... ON CONFLICT` **write** into `query_descriptor_stats`,
    per read query. Reads are never write-free.
- **Fallback path** (cipher or auth evaluator configured, or descriptor
  unsupported): `listNodes` for the **whole schema**, decrypt every node,
  per-node auth check, then JS filter/sort/slice
  ([store.ts:633-660](../../packages/data/src/store/store.ts)). Any future
  enabling of encryption-at-rest or row-level auth silently degrades every
  query to a full scan. A `where` clause also disables system-list
  pushdown in the fallback (`canPushSystemListQuery`,
  [store.ts:712](../../packages/data/src/store/store.ts)).

### Invalidation anatomy — the core problem

[main-thread-bridge.ts:835-969](../../packages/data-bridge/src/main-thread-bridge.ts):
store changes are microtask-batched, then for **each cache entry on the
changed schema**:

```mermaid
flowchart TD
    CH["node change event"] --> FLUSH{"flush batch"}
    FLUSH -->|"&gt; 25 events<br/>or batchSize &gt; 25"| RELOADALL["full store re-query for<br/>EVERY entry on schema"]
    FLUSH -->|"&le; 25 events"| PER["per entry on schema"]
    PER --> BOUND{"descriptor has<br/>limit / offset / cursor?"}
    BOUND -->|"yes (every paginated list)"| TOUCH{"change touches<br/>result or matches?"}
    TOUCH -->|yes| RELOAD["kind: 'reload'<br/>full SQLite re-query<br/>+ parity audit + EXPLAIN<br/>+ telemetry write + count"]
    TOUCH -->|no| NOOP1["noop"]
    BOUND -->|no| DELTA["applyNodeChangeToQueryResult:<br/>O(n) findIndex + O(n) re-filter<br/>+ O(n log n) re-sort + new array"]
    DELTA --> SET["cache.set → notify ALL subscribers<br/>(no equality check)"]
    RELOAD --> SET
    RELOADALL --> SET
    SET --> RENDER["each subscriber:<br/>flattenNodes (new identities)<br/>→ React re-render"]
```

The killers, specifically:

- `nodeQueryDescriptorNeedsBoundedReload`
  ([query.ts:709](../../packages/data/src/store/query.ts)) — `limit`
  present → reload. `page.first` maps to `limit`
  ([query.ts:577](../../packages/data/src/store/query.ts)), so the
  _recommended_ pagination option opts every list into re-execution.
  Affected today: Sidebar's three queries (limit + orderBy,
  [Sidebar.tsx:81-92](../../apps/web/src/components/Sidebar.tsx)), the grid
  row query (`limit: pageSize`,
  [useGridDatabase.ts:244-250](../../packages/react/src/hooks/useGridDatabase.ts)),
  all eight DataWorkspaceView count probes
  ([DataWorkspaceView.tsx:246-267](../../apps/web/src/components/DataWorkspaceView.tsx)).
  **Editing one cell in a grid full re-queries the row set** (and its
  materialized view path), plus the parity audit, per keystroke burst.
- `handleStoreBatchChange`
  ([main-thread-bridge.ts:928](../../packages/data-bridge/src/main-thread-bridge.ts))
  — batch events reload **every** entry on the schema unconditionally,
  even entries whose results cannot have changed.
- For unbounded queries, the incremental path still re-filters and
  re-sorts the **entire** array per change
  (`applyQueryDescriptor`,
  [query-descriptor.ts:128-166](../../packages/data-bridge/src/query-descriptor.ts)),
  and search filters re-tokenize every node's text — including a TipTap
  tree walk — per evaluation
  ([query.ts:544-565](../../packages/data/src/store/query.ts)).
- `QueryCache.set` ([query-cache.ts:169-216](../../packages/data-bridge/src/query-cache.ts))
  notifies unconditionally. A reload that returns identical data still
  produces a new array → new flatten → full re-render fan-out.

The existing baseline captures this end-to-end:
`query-update-fanout-10000` = **5.94 ms** for ONE update with ONE
subscribed query ([collect-core-platform-baselines.ts:155](../../scripts/collect-core-platform-baselines.ts)),
on the memory adapter. The browser path adds Comlink round trips and OPFS
I/O, and real screens multiply by active-query count.

### Write path anatomy (useMutate → store.update)

```mermaid
sequenceDiagram
    participant C as Component
    participant UM as useMutate
    participant B as MainThreadBridge
    participant NS as NodeStore (main thread)
    participant W as SQLite worker (Comlink)

    C->>UM: update(Schema, id, {title})
    UM->>UM: setPendingCount(+1) → re-render #1
    UM->>B: bridge.update(id, changes)
    B->>NS: store.update(id, {properties})
    NS->>W: getNode(id)  [RT 1]
    NS->>NS: structuredClone + assertAuthorized
    NS->>W: getLastChange(id)  [RT 2]
    NS->>NS: canonicalize + blake3 + Ed25519 sign (0.37 ms)
    NS->>W: getNode(id)  [RT 3, applyChange]
    NS->>W: appendChange(change)  [RT 4]
    NS->>W: setLastLamportTime  [RT 5]
    NS->>W: setNode(node)  [RT 6]
    NS->>W: getNode(id)  [RT 7, re-read result]
    NS-->>B: emit(change) → microtask flush
    B->>W: full re-query per bounded entry (+audit +telemetry)
    B-->>C: notify → flatten → render
    UM->>UM: setPendingCount(-1) → re-render #2
```

Seven storage round trips, a main-thread signing operation, and two
bookkeeping re-renders — per single-property update
([store.ts:387-458](../../packages/data/src/store/store.ts),
[store.ts:1862-1893](../../packages/data/src/store/store.ts),
[useMutate.ts:263-272](../../packages/react/src/hooks/useMutate.ts)).
`useMutate`'s header comment promises "Immediate local updates (bridge
updates UI subscribers synchronously)" — but the cache only updates after
the full persistence path completes and the change event flushes. There is
no optimistic apply.

Note the `bulk` path is already good: exploration 0157 added storage-owned
batch writes (`bulkWrite` → `batchWrite`), and `database-create-row` style
flows that use transactions amortize correctly. The problem is the
_singular_ update — the most common interactive operation.

### Per-cell subscription fan-out

[useCell.ts:92](../../packages/react/src/hooks/useCell.ts),
[useDatabaseRow.ts:142](../../packages/react/src/hooks/useDatabaseRow.ts),
and [useNode.ts:1094](../../packages/react/src/hooks/useNode.ts) each
attach a listener to the **global** `store.subscribe` feed and filter by
nodeId inside the callback. A 50×8 grid mounts 400 listeners; every change
event anywhere in the store invokes all 400 callbacks. Dispatch is
O(listeners), not O(affected).

### What is already good

- Query deduplication by canonical serialized descriptor — N components
  sharing one query share one cache entry and one storage execution.
- Microtask batching of change events before invalidation.
- Single-change incremental apply for unbounded queries (no storage hit).
- Batched id-hydration with bind-parameter chunking in the SQLite adapter.
- LRU eviction with subscriber-aware retention in QueryCache.
- The benchmark harness (`pnpm bench:core-platform`) already measures the
  exact fan-out this exploration targets.

## External Research

Findings from a survey of local-first/reactive-query systems (see
References for sources):

- **RxDB EventReduce**: RxDB's core insight is that when a query's
  previous result and a change event are both known, the new result can
  almost always be computed without re-execution. Their CI benchmark
  reports ~**94% of queries** answerable purely from events, with up to
  ~12× faster updated-result latency in their demo. The algorithm
  enumerates a binary decision tree over (query has limit? change is
  insert/update/delete? was-in-result? sort-field affected?) — compiled
  offline into a lookup table. This is precisely the bounded-query gap in
  xNet's `applyNodeChangeToQueryResult`: RxDB handles `limit` queries
  incrementally by keeping the previous result plus a small overfetch,
  falling back to re-exec only on genuinely ambiguous transitions (e.g.,
  a result shrinks below `limit` and the next candidate is unknown).
- **Rocicorp Zero (ZQL/IVM)**: Zero maintains query results via
  incremental view maintenance over differential streams — each operator
  (filter, join, sort, limit) consumes row deltas and emits result deltas.
  Queries stay registered with the engine; a write produces O(delta) work
  per affected query rather than O(result) or O(table). Zero's docs
  emphasize keeping queries "warm" so navigation is instant. The lesson
  for xNet is architectural: the bridge already holds the descriptor AND
  the previous result — the delta engine just needs more cases than
  "unbounded set vs full reload".
- **TanStack Query structural sharing**: `replaceEqualDeep` walks new
  results against old, reusing prior sub-objects when deep-equal, so
  unchanged items keep referential identity and `React.memo` children skip
  re-rendering. Combined with "tracked properties" (only re-render when a
  field the component actually read changed) and batched notifications
  (`notifyManager`), this is the industry-standard render-suppression
  stack. xNet has none of the three today.
- **SQLite WASM/OPFS**: with OPFS sync-access-handle VFS, simple indexed
  reads are tens-of-µs-to-ms scale, but every main-thread→worker hop adds
  postMessage + structuredClone overhead proportional to payload size.
  Guidance across sqlite-wasm discussions: batch statements per message,
  move logic to the worker, return only final results. xNet currently does
  the opposite for writes (7 hops) and for invalidation (re-query returns
  full row sets per change).
- **Ed25519 in JS**: @noble/curves signs in roughly 0.2–0.5 ms (we
  measured 0.37 ms including canonicalization + blake3). Fine per
  interactive edit; hostile to bulk loops on the main thread (1000 signs ≈
  370 ms of jank). WebCrypto Ed25519 (now broadly shipped) is several
  times faster and runs off-thread; batching signs in a worker removes the
  cost from the interactive path entirely.
- **Write coalescing**: editor-class apps (Linear, Figma-style docs,
  Automerge/Yjs ecosystems) apply mutations to an in-memory view
  synchronously and persist asynchronously (write-behind), grouping
  rapid-fire changes into transactions. xNet's `useCell` already debounces
  at 300 ms — the store should offer the same guarantee underneath:
  optimistic cache apply now, durable signed change soon.

## Key Findings

Ranked by expected impact on interactive latency:

| #   | Finding                                                                                | Where                                                                                                                                                                                               | Cost today                                                          | Expected win                                                         |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Bounded queries (`limit`/`page`) fully re-execute on every matching change             | [query.ts:709](../../packages/data/src/store/query.ts), [main-thread-bridge.ts:898-924](../../packages/data-bridge/src/main-thread-bridge.ts)                                                       | 5.9 ms × active bounded queries, per update (10k nodes)             | 10–50× on edit-heavy screens (grids, sidebar)                        |
| 2   | Parity audit + EXPLAIN + index listing + telemetry write on every query, by default    | [sqlite-adapter.ts:277,882,2674-2865](../../packages/data/src/store/sqlite-adapter.ts)                                                                                                              | ~2–5× per-query multiplier for ≤1000-node schemas; a write per read | 2–5× on every query, one-line-ish fix                                |
| 3   | No structural sharing; full re-flatten per subscriber per change; unconditional notify | [useQuery.ts:360-404](../../packages/react/src/hooks/useQuery.ts), [query-cache.ts:195](../../packages/data-bridge/src/query-cache.ts)                                                              | 0.53 ms/1000 nodes/subscriber + full child re-render fan-out        | eliminates most wasted renders                                       |
| 4   | Single update = 7 worker round trips + main-thread sign + 2 pending re-renders         | [store.ts:387-458,1862-1893](../../packages/data/src/store/store.ts), [useMutate.ts:263](../../packages/react/src/hooks/useMutate.ts)                                                               | ~5.6 ms create on memory adapter; worse over Comlink                | 3–5× write latency; perceived latency → sub-ms with optimistic apply |
| 5   | Batch events (>25 changes) reload every query on schema unconditionally                | [main-thread-bridge.ts:84,865-936](../../packages/data-bridge/src/main-thread-bridge.ts)                                                                                                            | N full re-queries per bulk op                                       | bounded by delta size instead                                        |
| 6   | Per-cell/per-row global store subscriptions                                            | [useCell.ts:92](../../packages/react/src/hooks/useCell.ts), [useDatabaseRow.ts:142](../../packages/react/src/hooks/useDatabaseRow.ts), [useNode.ts:1094](../../packages/react/src/hooks/useNode.ts) | O(cells) callback invocations per change                            | O(1) dispatch via nodeId index                                       |
| 7   | Cipher/auth config silently disables all SQL pushdown                                  | [store.ts:621](../../packages/data/src/store/store.ts)                                                                                                                                              | full scan + per-node auth per query                                 | design constraint to fix before enabling E2EE                        |
| 8   | Worker bridge exists but unused; all query/sign/invalidate work on main thread         | [context.ts:141](../../packages/react/src/context.ts), [worker/data-worker.ts](../../packages/data-bridge/src/worker/data-worker.ts)                                                                | main-thread jank under load                                         | frees the UI thread entirely                                         |

Non-findings (measured, honest): descriptor build + JSON serialization per
render (~1 µs) and `structuredClone` per write (~3 µs) are noise; devtools
instrumentation is correctly null in production; the QueryCache LRU and
dedup design is sound.

## Options And Tradeoffs

### A. Fixing invalidation-by-re-execution (finding 1)

| Option                                                    | How                                                                                                                                                                                                             | Pros                                                                                                                                                                                    | Cons                                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A1. Overfetch buffer + delta (recommended)                | Bridge fetches `limit + K` (K≈25) rows, keeps them as the entry's working set, applies deltas in memory, slices `limit` for subscribers; re-query only when buffer underflows or an ambiguous transition occurs | Removes ~all re-queries for the common cases (in-place update, insert-into-window, remove-with-spare); contained in `query-descriptor.ts`/`main-thread-bridge.ts`; RxDB-proven approach | Slightly more memory per entry; cursor (`after`) queries need care; correctness matrix must be tested hard  |
| A2. Full EventReduce-style decision table                 | Port/adapt RxDB's event-reduce truth table over (op × in-result × sort-impact × limit)                                                                                                                          | Maximal coverage (~94% claim), proven library                                                                                                                                           | Bigger lift; xNet sort semantics (nodeId tiebreak, null ordering) must match exactly; license/port overhead |
| A3. SQL-level materialized views with incremental refresh | Push windows into `materialized_query` tables refreshed by rowid deltas                                                                                                                                         | Moves work off JS entirely                                                                                                                                                              | Highest complexity; SQLite WASM has no native IVM; still crosses worker per refresh                         |

### B. Per-query adapter overhead (finding 2)

| Option                          | How                                                                                                                                        | Pros                                                   | Cons                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| B1. Flip defaults (recommended) | `queryVerification.enabled: false` and diagnostics/EXPLAIN behind `xnet:query:debug`; sample telemetry (e.g., 1-in-50 queries or dev-only) | Immediate 2–5× per-query win; zero architecture change | Lose always-on parity safety net — keep it in CI/integration tests instead |
| B2. Async audit                 | Run parity audit post-response on idle callback                                                                                            | Keeps the net in production                            | Still pays the full-schema scan, just later; complexity                    |

### C. React identity churn (finding 3)

| Option                                                     | How                                                                                                                                                                     | Pros                                                                                                       | Cons                                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1. WeakMap flatten cache + array reuse (recommended)      | `WeakMap<NodeState, FlatNode>` so unchanged `NodeState` references reuse their flat object; if every element mapped to its previous identity, return the previous array | O(changed) flatten work; unchanged rows keep identity → `React.memo` rows stop re-rendering; no API change | Requires bridge deltas to preserve unchanged `NodeState` references (they already do for the `set` path; reloads need result-merging — pair with A1) |
| C2. TanStack-style `replaceEqualDeep` after every snapshot | Deep-compare new vs old, graft old identities                                                                                                                           | Works even when references break (reloads)                                                                 | O(result) deep compare per update; treats symptom not cause                                                                                          |
| C3. Equality short-circuit in `QueryCache.set`             | Skip notify when data is shallow-equal (element-wise reference equality)                                                                                                | Stops no-op render cascades after reloads with identical data                                              | Needs C1/A1 to make references stable enough to ever be equal                                                                                        |

C1 + C3 together, with A1 preserving references, is the coherent set.

### D. Write path (finding 4)

| Option                                              | How                                                                                                                                                   | Pros                                                            | Cons                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| D1. Single-op transaction reuse (recommended first) | Route `store.update` through the same storage-owned write pattern as `batchWrite`: one worker message doing read-modify-write-append-clock atomically | 7 round trips → 1–2; transactional by construction              | Adapter API addition (`applySignedChange`-style op)                 |
| D2. Optimistic cache apply                          | Bridge applies the change to affected cache entries synchronously (it already has `applyNodeChangeToQueryResult`), then persists; reconcile on error  | Perceived latency → sub-ms; matches the useMutate doc comment   | Rollback path needed; temp-id flows already exist for creates       |
| D3. Off-thread signing                              | Sign in the SQLite (or data) worker; or WebCrypto Ed25519                                                                                             | Removes 0.37 ms × N from main thread; bulk imports stop janking | Key material handling moves to worker (already crosses for storage) |

### E. Structural (findings 6–8)

- **E1. NodeId-indexed subscription dispatch**: store keeps
  `Map<nodeId, Set<listener>>` alongside the global set; `useCell`-class
  hooks register per-node. O(1) dispatch. Small, local, high value for
  grids.
- **E2. Worker-resident NodeStore (the existing "later phases" plan)**:
  move NodeStore + bridge invalidation into `data-worker.ts`; main thread
  holds a thin cache of final snapshots. This is the end-state that makes
  every other cost invisible to the UI thread — but it's a migration, not
  a fix, and A–D are prerequisites for it to be fast _in_ the worker too.

## Recommendation

Phase the work so each step lands independently and is verified by the
existing benchmark harness plus new fan-out benches:

1. **Phase 0 — stop paying for diagnostics (days):** B1. Flip
   `DEFAULT_QUERY_VERIFICATION.enabled` to false (keep it on in vitest
   integration suites), gate `collectCompiledQueryDiagnostics` behind the
   debug flag, sample `recordQueryTelemetry`. Re-run
   `bench:core-platform`; expect `database-create-row` and fan-out to drop
   immediately.
2. **Phase 1 — incremental bounded queries (1–2 weeks):** A1 overfetch
   buffer in the bridge + delta application for limited/ordered queries;
   kill the unconditional reload in `handleStoreBatchChange` by routing
   batches through grouped deltas with a much higher reload threshold.
   Target: `query-update-fanout-10000` < 0.5 ms.
3. **Phase 2 — identity-stable React layer (days):** C1 WeakMap flatten
   cache + previous-array reuse in `useQuery`; C3 equality short-circuit
   in `QueryCache.set`; fix `getMetadata` reactivity by folding metadata
   into the subscribed snapshot or versioning it; make `useMutate` pending
   state lazy (subscribe-on-read) so unused `isPending` costs zero
   renders.
4. **Phase 3 — one-round-trip writes (1 week):** D1 single-message
   read-modify-write in the SQLite adapter; D2 optimistic apply in the
   bridge with rollback; D3 move signing off the interactive path.
5. **Phase 4 — worker-resident data layer (exploration + migration):** E2,
   building on the existing `WorkerBridge`/`data-worker.ts` skeleton, with
   binary snapshot transfer (`utils/binary-state.ts` already exists).
   Sequence after Phases 0–3 since they all apply inside the worker too.

E1 (nodeId dispatch index) can land any time; it is independent.

## Example Code

Phase 1 sketch — bounded-query working set in the bridge:

```ts
// query-cache entry gains a working set larger than the visible window
interface CacheEntry {
  data: NodeState[] | null // visible window (sliced to limit)
  workingSet: NodeState[] | null // limit + OVERFETCH rows, descriptor-ordered
  // ...
}

const OVERFETCH = 25

function applyChangeToBoundedResult(input: {
  descriptor: QueryDescriptor // has limit L
  workingSet: NodeState[] // sorted, length ≤ L + OVERFETCH
  nodeId: string
  nextNode: NodeState | null
}): QueryResultDelta {
  const { descriptor, workingSet, nodeId, nextNode } = input
  const limit = descriptor.limit!
  const idx = workingSet.findIndex((n) => n.id === nodeId)
  const matches = matchesQueryDescriptor(descriptor, nextNode)

  // Case 1: irrelevant change — node not in working set and doesn't match
  if (idx < 0 && !matches) return { kind: 'noop' }

  // Case 2: removal/unmatch — drop and re-slice; reload only on underflow
  if (idx >= 0 && !matches) {
    const next = workingSet.filter((n) => n.id !== nodeId)
    return next.length >= limit
      ? { kind: 'set', data: next } // buffer absorbs the loss
      : { kind: 'reload' } // genuinely unknown next row
  }

  // Case 3: in-place update or insert — re-sort the small working set
  const merged =
    idx >= 0
      ? workingSet.map((n) => (n.id === nodeId ? nextNode! : n))
      : insertSorted(workingSet, nextNode!, descriptor) // O(log n) position
  // beyond-window inserts that sort after the buffer are noops
  return { kind: 'set', data: merged.slice(0, limit + OVERFETCH) }
}
```

Phase 2 sketch — identity-preserving flatten in `useQuery`:

```ts
const flatCache = new WeakMap<NodeState, FlatNode<never>>()

function flattenNodeCached<P extends Record<string, PropertyBuilder>>(
  node: NodeState
): FlatNode<P> {
  const hit = flatCache.get(node)
  if (hit) return hit as FlatNode<P>
  const flat = flattenNode<P>(node)
  flatCache.set(node, flat as FlatNode<never>)
  return flat
}

// in the list memo: reuse the previous array when nothing changed
const prevRef = useRef<FlatNode<P>[]>([])
const data = useMemo(() => {
  const next = rawData.map((n) => flattenNodeCached<P>(n))
  const prev = prevRef.current
  const same = next.length === prev.length && next.every((f, i) => f === prev[i])
  if (same) return prev
  prevRef.current = next
  return next
}, [rawData])
```

Phase 3 sketch — pending state without forced re-renders:

```ts
// Module-level pending store shared by all useMutate instances
const pendingStore = {
  count: 0,
  listeners: new Set<() => void>(),
  subscribe(cb: () => void) {
    /* add/remove */
  },
  getSnapshot: () => pendingStore.count
}

export function useMutate(): UseMutateResult {
  // components that never destructure isPending never subscribe
  const isPending = () => useSyncExternalStore(pendingStore.subscribe, pendingStore.getSnapshot) > 0
  // ... create/update/remove mutate pendingStore.count without setState
}
```

## Risks And Open Questions

- **Delta-correctness for bounded queries** is the classic source of
  subtle bugs (RxDB ships a generated truth table for a reason). The
  parity audit we are disabling in production is exactly the right
  validation harness for this work — keep it enabled in CI and add a
  randomized property test (random ops vs. re-executed ground truth).
- **Cursor (`after`) pagination** interacts with overfetch buffers; v1 can
  keep reload semantics for cursor pages (rare in hot paths) and only
  upgrade `limit`-only windows.
- **Reference stability across reloads**: when a reload does happen, the
  fresh `NodeState` objects break the WeakMap flatten cache. Merging
  reload results against the previous working set by `(id, updatedAt)` to
  reuse unchanged references would preserve identity; measure whether it
  pays for itself.
- **Optimistic apply + auth failure**: a rejected write must roll back
  cache entries; the temp-id machinery (`tempids.ts`) covers creates but
  update rollback needs the `previousNode` snapshot the store already
  clones.
- **Telemetry loss**: sampling `query_descriptor_stats` weakens adaptive
  indexing's signal (it needs `minHits: 20`). Counting hits in memory and
  flushing periodically preserves the signal without a write per read.
- **Does anything depend on parity metadata?** `plan.parityCheck` is
  surfaced through query metadata; devtools may display it. Gate, don't
  delete.
- **Worker-resident store (Phase 4)** changes `bridge.nodeStore`
  availability on the main thread — `useMutate.mutate()` transactions and
  several hooks reach for it directly; an async transaction API must come
  first.

## Implementation Checklist

Phase 0 — adapter overhead:

- [ ] Default `queryVerification.enabled` to `false`; enable explicitly in vitest/integration suites
- [ ] Gate `collectCompiledQueryDiagnostics` behind `xnet:query:debug`
- [ ] Make `recordQueryTelemetry` sample (or buffer in memory and flush on idle), preserving adaptive-index hit counting
- [ ] Re-run `pnpm bench:core-platform` and commit updated baselines

Phase 1 — incremental bounded queries:

- [ ] Add working-set (limit + overfetch) storage to `QueryCache` entries
- [ ] Implement `applyChangeToBoundedResult` in `query-descriptor.ts` with the underflow→reload fallback
- [ ] Route `handleStoreChange`/`handleStoreChangeSet` bounded entries through the delta path
- [ ] Replace `handleStoreBatchChange`'s unconditional reload with grouped delta application + raised reload threshold
- [ ] Property-test deltas against re-executed ground truth (reuse parity-audit comparator)
- [ ] Add `query-update-fanout` benches for bounded queries at 1k/10k/50k and multi-query fan-out (10 active queries)

Phase 2 — React identity stability:

- [ ] WeakMap flatten cache + previous-array reuse in `useQuery`
- [ ] Element-wise reference-equality short-circuit in `QueryCache.set` before notify
- [ ] Fold metadata into the subscribed snapshot (or version it) so metadata-only updates render reliably
- [ ] Rework `useMutate` pending tracking to subscription-on-read (no setState when `isPending` unused)
- [ ] Stabilize `descriptor`/`reload`/`pageInfo` against inline-filter identity churn (key memos on `queryKey` only)

Phase 3 — write path:

- [ ] Add single-message read-modify-write op to the storage adapter (reuse `batchWrite` transaction plumbing)
- [ ] Optimistic cache apply in `MainThreadBridge.update/create/delete` with rollback from `previousNode`
- [ ] Move change signing off the interactive path (worker or WebCrypto), batch for bulk flows
- [ ] Bench: `database-update-row` end-to-end and perceived (cache-visible) latency separately

Phase 4 — worker-resident data layer:

- [ ] Write a follow-up exploration for migrating NodeStore into `data-worker.ts` (async transaction API, snapshot transfer via `binary-state.ts`, devtools story)

Independent:

- [ ] NodeId-indexed listener dispatch in `NodeStore.subscribe` consumers (`useCell`, `useDatabaseRow`, `useNode`)

## Validation Checklist

- [ ] `pnpm bench:core-platform`: `query-update-fanout-10000` drops from ~5.9 ms to < 0.5 ms
- [ ] New multi-query fan-out bench (10 bounded queries, 10k nodes): single update < 2 ms total
- [ ] `database-create-row` < 2 ms (memory adapter) after Phase 0 + 3
- [ ] React Profiler on the grid (50×8): editing one cell re-renders only that row/cell, not the table
- [ ] Sidebar does not re-query (verify via `plan` strategy counters / query debugger) while typing in a page title
- [ ] Parity property tests green: 10k randomized op sequences, delta results === re-executed results, per descriptor shape (limit, orderBy, where, mixed)
- [ ] No regression in `pnpm test` (store, bridge, react hook suites)
- [ ] Devtools query panel still shows plans when `xnet:query:debug` is set

## References

- [packages/react/src/hooks/useQuery.ts](../../packages/react/src/hooks/useQuery.ts), [useMutate.ts](../../packages/react/src/hooks/useMutate.ts) — the hooks under study
- [packages/data-bridge/src/main-thread-bridge.ts](../../packages/data-bridge/src/main-thread-bridge.ts), [query-cache.ts](../../packages/data-bridge/src/query-cache.ts), [query-descriptor.ts](../../packages/data-bridge/src/query-descriptor.ts) — invalidation core
- [packages/data/src/store/query.ts](../../packages/data/src/store/query.ts), [store.ts](../../packages/data/src/store/store.ts), [sqlite-adapter.ts](../../packages/data/src/store/sqlite-adapter.ts) — execution core
- [scripts/collect-core-platform-baselines.ts](../../scripts/collect-core-platform-baselines.ts) — benchmark harness used for the numbers above
- Exploration 0156/0157 — import-speed and batch-write predecessors to this doc
- RxDB EventReduce — https://github.com/pubkey/event-reduce (≈94% of queries answerable from events; algorithm + decision-table design)
- Rocicorp Zero docs (ZQL incremental view maintenance) — https://zero.rocicorp.dev/docs/reactivity
- TanStack Query structural sharing & render optimizations — https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations
- SQLite WASM + OPFS performance discussion — https://sqlite.org/wasm/doc/trunk/persistence.md
- @noble/curves benchmarks — https://github.com/paulmillr/noble-curves#speed
