---
'@xnetjs/react': patch
'@xnetjs/sqlite': patch
---

Serialize document saves and retain failed writes for retry when closing a desktop workspace. Keep newer edits dirty until their write finishes. Electron SQLite now syncs the WAL on commit before acknowledging writes.
