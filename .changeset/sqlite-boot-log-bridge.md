---
'@xnetjs/sqlite': patch
---

Forward the SQLite Web Worker's boot-debug diagnostics to the main thread so the
in-app Logs panel captures them (exploration 0229). The per-op queue/exec timing
(`[xNet] sqlite op`) and one-shot DB stats (`[xNet] db stats @ open`) were
emitted only in the dedicated worker's console, which the main-thread console tap
never sees — so every boot-stall capture/export came back missing exactly those
lines. The worker now `postMessage`s each boot-debug line (under a dedicated
discriminator key that can't collide with Comlink RPC) and `WebSQLiteProxy`
re-emits it on the main console. Gated by `xnet:boot:debug`; no effect on normal
operation.
