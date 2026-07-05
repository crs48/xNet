---
'@xnetjs/data': minor
'@xnetjs/data-bridge': minor
'@xnetjs/sqlite': patch
'@xnetjs/react': patch
---

Query-model read-speed upgrades (exploration 0264).

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
