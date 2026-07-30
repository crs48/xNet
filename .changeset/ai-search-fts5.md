---
'@xnetjs/data': minor
'@xnetjs/plugins': minor
---

AI retrieval now uses the FTS5 index instead of scanning. `NodeStore` (and
the storage adapter contract) gain an optional `searchText(query, limit)`
that runs a cross-schema BM25 search over `nodes_fts`; the AI surface's
`search` tool prefers it and falls back to the substring scan only when the
storage has no FTS support.
