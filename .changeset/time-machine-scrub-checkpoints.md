---
'@xnetjs/history': minor
'@xnetjs/data': minor
'@xnetjs/sqlite': minor
'@xnetjs/runtime': minor
'@xnetjs/react': minor
---

Time Machine P1 (exploration 0329): frontiers, checkpoints, pins, prune horizon, scope timelines, production Yjs snapshot capture, and a React scrub hook.

- `@xnetjs/history`: new `Frontier` primitive (hash-anchored per-node positions:
  `captureFrontier`, `frontierAtWallTime`, `frontierTarget`,
  `materializeAtFrontier`, Yjs snapshot refs + pin keys); named checkpoints
  (`createCheckpoint`, `listCheckpoints`, `deleteCheckpoint`, `pinFrontier`,
  `restoreToFrontier`); `ScopeTimeline`/`ScopeScrubCache` generalizing
  `SchemaTimeline` to arbitrary node sets; `HistoryHorizonError` +
  `HistoryEngine.getHorizon` — targets below the prune horizon now fail loudly
  instead of silently remapping to the wrong change.
- `@xnetjs/data`: `Checkpoint` node schema (`CHECKPOINT_SCHEMA_IRI`); pin
  registry on storage adapters (`NodeStorageAdapter.pins`, `PinEntry`,
  `PinRegistry`) protecting pinned changes and Yjs snapshots from pruning and
  eviction (memory + SQLite implementations).
- `@xnetjs/sqlite`: `pinned_changes` table (additive migration).
- `@xnetjs/runtime`: Yjs history snapshots are now captured on production doc
  persists (throttled session-boundary/min-interval capture in NodePool).
- `@xnetjs/react`: new `useTimeMachine` hook (hooks sub-barrel) binding a
  scrubber UI to the merged scope timeline: position/step navigation, preview +
  property diff at the scrub position, named versions, one-transaction restore,
  and history-horizon reporting.
