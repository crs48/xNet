---
'@xnetjs/data': minor
'@xnetjs/react': minor
---

Drafts UI plumbing (exploration 0329 P2/P3).

- `@xnetjs/react`: new `useDraft(hostId)` hook (hooks sub-barrel) binding the
  draft engine and the NodeStore checkout overlay — list/create open drafts
  for a host, `checkout` (content-swap reads + lazy copy-on-write via
  `onMissingMember` → `forkNodeIntoDraft`), `returnToMain`, `discard`
  (leaves the checkout first), `merge` (merger-signed squash; returns
  conflict cards), `refresh` (fold main into the draft; pauses on
  conflicts), `setReviewRequested`, and `computeReview` — per-property
  three-way review cards (base at fork vs main now vs draft now) plus Yjs
  document-differs indicators, computed without applying anything. Database
  hosts widen the member scope to their row nodes. Re-exports
  `DraftMergeConflict`, `MergeDraftResult`, `RefreshDraftResult` for
  consumers.
- `@xnetjs/data`: the `Draft` schema gains an optional `reviewRequested`
  checkbox (default `false`) — the P4 request-surfacing flag the
  Inbox/Requests surface lists open drafts by.
