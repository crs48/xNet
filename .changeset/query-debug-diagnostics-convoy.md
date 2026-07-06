---
'@xnetjs/sqlite': patch
'@xnetjs/data': patch
---

Query-plan debug diagnostics no longer convoy the SQLite worker. With
`xnet:query:debug` enabled, every query used to issue EXPLAIN QUERY PLAN +
PRAGMA schema_version + one PRAGMA index_info per index as separate serial
worker round-trips — hundreds per boot, delaying real query results by
18-20s. `getIndexInfo` now dedupes concurrent callers onto one in-flight
build and fetches all index metadata in a single batched
`pragma_index_info` join (with a per-index fallback for runtimes without
table-valued pragmas), and the storage adapter collects plan diagnostics
once per unique compiled SQL shape per session instead of per execution
(invalidated when adaptive indexes are created or dropped).
