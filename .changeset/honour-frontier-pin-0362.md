---
'@xnetjs/data': patch
---

Correct the documented shape of `Page.publishedFrontier` (exploration 0362).

A frontier entry is `{ hash, yjsSnapshotRef? }`, matching
`packages/history/src/frontier.ts` — not a bare change hash. Without the
`yjsSnapshotRef` arm a published post pins only its record lane, so its prose
would drift with every edit.

No stored data changes shape: the property is `json` and was not yet written
by any shipping code path.
