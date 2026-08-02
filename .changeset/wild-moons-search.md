---
'@xnetjs/brain': major
'@xnetjs/plugins': minor
---

Retrieval now reports how it searched, not just what it found.

`WorkspaceRetrieval.retrieveContext` returns `{ nodes, provenance }` instead of
a bare node array — a **breaking** change for direct callers, who previously
got the nodes and no way to learn that the search had fallen back to a bounded
substring scan. Use `result.nodes` where you used the array, and
`result.provenance` for the tier, the `degraded` flag and a printable notice.

On the `@xnetjs/plugins` side everything is additive: `AiContextRetriever`
accepts either shape, `AiContextPack` gained an optional `retrieval` field, and
a resource's `citation` gained the optional `path` the retriever had always
computed and the pack had always dropped.

`SCAN_NOTICE` is now exported from `@xnetjs/brain` so every lane warns in the
same words.
