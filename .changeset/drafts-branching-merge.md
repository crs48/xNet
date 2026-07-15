---
'@xnetjs/history': minor
'@xnetjs/data': minor
'@xnetjs/runtime': minor
---

Drafts P2/P3 (exploration 0329): Patchwork-style branching on the change log.

- `@xnetjs/data`: `Draft` node schema (`DRAFT_SCHEMA_IRI`, entries map, no
  nesting); `NodeStore` draft overlay — `setCheckedOutDraft` swaps member
  reads to clone content under original ids, redirects member writes to
  clones with lazy copy-on-write, mirrors clone change events to original-id
  subscribers, and exposes `getRaw` for overlay-free reads; device-local
  draft privacy set (`markDraftPrivate`/`isDraftPrivate`).
- `@xnetjs/history`: draft lifecycle (`createDraft`, `forkNodeIntoDraft` —
  signed snapshot-create + pinned fork point + Yjs blob fork with state
  vector, `discardDraft`, `listDrafts`, never-fork policy); merge
  (`threeWayPropertyMerge`, `mergeDraft` — one merger-signed squash batch
  with draft-born promotion via temp ids, relation remapping, deletion
  conflict cards, idempotent Yjs delta lane, provenance) and
  `refreshDraftFromMain` (floating drafts).
- `@xnetjs/runtime`: `NodeStoreSyncProvider` gains a `shouldPublish`
  predicate; the personal node-sync room excludes draft-private nodes, and
  draft privacy is rehydrated before sync starts.
