---
'@xnetjs/data': minor
---

Local writes now advance from the persisted change clock, so editing a node after another local store imports it does not silently retain the earlier value. `NodeStore.refreshPersistedNodes` refreshes subscribers from already-committed shared storage without applying or broadcasting those changes again.
