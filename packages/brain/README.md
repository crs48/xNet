# @xnetjs/brain

The AI second-brain layer (exploration
[0211](../../docs/explorations/0211_[_]_AI_SECOND_BRAIN_GRAPHRAG_MEMORY_AND_TIERING.md)).

xNet already had the three hard pieces of a great AI second brain — a governed
node graph (`@xnetjs/data`), full-text search, and a vector engine
(`@xnetjs/vectors`) — but they were never wired together, and retrieval into the
agent was keyword-only. This package is the thin layer that connects them into a
**hybrid GraphRAG retriever** with a strict token/hop budget, so the agent gets a
small, ranked, citation-carrying slice of the graph instead of being overwhelmed.

## What's here

| Module | Responsibility |
| --- | --- |
| `retrieve.ts` | The core retriever: hybrid entry search → bounded graph expansion → authorization → rank → pack to budget. Pure over injected deps. |
| `expand.ts` | Breadth-first graph expansion with readable paths; `nodeStoreGraphAccess` adapter over a real `NodeStore`. |
| `pack.ts` | Token estimation + greedy budget packing — the "don't overwhelm" mechanism. Dropped nodes become just-in-time `expandable` refs. |
| `indexer.ts` | Incremental embedding pipeline: subscribes to store changes, debounced, (re)embeds node text into the vector index. Wakes the dormant `@xnetjs/vectors` engine. |
| `memory.ts` | Mem0-style consolidation (`ADD`/`UPDATE`/`DELETE`/`NOOP`) + recency-decayed memory ranking. Pure. |
| `memory-apply.ts` | Applies consolidation decisions as governed `MemoryItem` node mutations (`applyMemoryOp` / `rememberFact`). |
| `locality.ts` | Working-set scoring + a locality planner that promotes the dormant `QuerySource` hint in `@xnetjs/data-bridge` into a real local-vs-hub policy. |
| `schema.ts` | Derives the `relationFieldsOf` resolver from compiled schemas, so graph-walk works with the built-in registry without a hand-written map. |
| `persist.ts` | Save/restore the vector tier through a blob store (`@xnetjs/storage`); a cold/corrupt tier reports `false` so the caller rebuilds lazily. |
| `index.ts` | `createBrain()` — wires all of the above into one adoptable object. |

## Usage

```ts
import { createBrain } from '@xnetjs/brain'

const brain = createBrain({
  store, // a NodeStore (get + subscribe)
  semanticSearch, // @xnetjs/vectors SemanticSearch, initialized
  keywordProvider, // optional FTS provider
  relationFieldsOf: (schemaId) => schemaRelationFields(schemaId),
  authorize: (nodeId) => policy.canRead(nodeId) // exploration 0192
})

brain.indexer.start()
await brain.indexer.reindexAll(allNodes) // cold-start backfill

const result = await brain.retrieve('how is Acme tied to my 2024 emails?', {
  maxTokens: 4000,
  maxHops: 2
})
// result.items       → ranked, budgeted; each carries a readable graph path
// result.expandable  → ids the agent can pull just-in-time
// result.stats       → entries / expanded / denied / dropped / tokens
```

## Design notes

- **Pure core, injected I/O.** `retrieve()` takes its search, graph, text, and
  authorization capabilities as dependencies, so it carries no hard dependency on
  the store or the vector engine and is exhaustively unit-testable.
- **Authorization runs before packing.** Candidates are filtered through the
  injected `authorize` gate (and fail closed on error) so a collaborative brain
  can never surface a node across an authz boundary.
- **The `QuerySource` types are mirrored, not imported,** so this package stays in
  the fast pure-TS test pool and avoids the Yjs-heavy `@xnetjs/data-bridge`.
