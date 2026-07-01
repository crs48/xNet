---
'@xnetjs/sqlite': minor
---

Web SQLite `open()` now retries on timeout instead of hard-failing the boot (exploration 0253).

A cold `installOpfsSAHPoolVfs()` on a large database file intermittently exceeds the 15s
open timeout — most often because a _prior_ boot's open timed out and leaked a worker still
holding the file's exclusive OPFS sync access handle, so the next boot's
`createSyncAccessHandle()` blocks on the contended handle. Previously the first timeout threw
("Initialization failed: Worker initialization timeout after 15s") and showed an error screen.

`WebSQLiteProxy.open()` now terminates the stuck worker (releasing the handle) and retries with
a fresh worker up to 3 attempts via the new `openWithTimeoutRetry` helper, so the leaked-handle
cascade recovers instead of failing. A genuinely broken/unavailable OPFS still fails cleanly
after the bounded attempts. Adds `SQLiteConfig.openTimeoutMs` (default 15000) to tune the
per-attempt timeout.
