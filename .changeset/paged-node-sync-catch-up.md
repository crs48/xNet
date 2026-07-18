---
'@xnetjs/runtime': minor
---

Fix permanently skipped changes on a cold catch-up of more than one page. The
hub caps a `node-sync-response` at 1000 changes but reported the room-wide
high-water mark alongside it, so a client that applied the page and persisted
that mark as its cursor jumped straight past every change in between — and
because the cursor is monotonic and persisted, those changes were never
re-requested. A room with 2500 pending changes delivered 1000 and silently lost
1500.

`NodeSyncResponse` gains an optional `hasMore` flag, and the sync provider now
walks the remaining pages in-session (re-requesting from the cursor it just
persisted) before pushing local changes, instead of leaving the remainder for a
later reconnect. Talking to a hub that does not send `hasMore` is unchanged.
