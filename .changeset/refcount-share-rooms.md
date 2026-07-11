---
'@xnetjs/runtime': patch
---

`SyncManager.subscribeShareRoom`/`unsubscribeShareRoom` are now refcounted, so multiple callers can subscribe to the same share room and it stays open until the last one unsubscribes (exploration 0298 follow-up — lets a channel/workspace boot-resync coexist with the per-view subscription).
