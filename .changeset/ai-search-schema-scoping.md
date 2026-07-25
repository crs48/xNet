---
'@xnetjs/sqlite': minor
'@xnetjs/data': minor
'@xnetjs/plugins': minor
---

Schema-scoped AI search now returns a full page of results. `searchNodes` and
`NodeStore.searchText` accept an optional `schemaId` that is pushed into the
FTS5 query (joining `nodes`, excluding soft-deleted rows) instead of being
applied to a cross-schema BM25 window afterwards — previously a scoped search
could come back nearly empty whenever that schema's matches ranked below the
window.

The AI `search` tool also reports how it matched: results carry `index`
(`'fts5'` or `'scan'`), `degraded`, and a `notice` when the full-text index was
unavailable, so an agent can tell a substring scan over a truncated window from
an exhaustive search rather than concluding a node does not exist.
