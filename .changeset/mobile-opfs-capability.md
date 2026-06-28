---
'@xnetjs/sqlite': minor
---

Add OPFS capability detection so the storage layer can pick and explain its
durable backend before opening — `detectOpfsCapability()`, plus the
`supportsOpfs`, `supportsSyncAccessHandle`, and `isCrossOriginIsolated`
predicates and the `OpfsCapability` / `OpfsPersistenceMode` types. The web
adapter uses it to emit an accurate diagnostic when synchronous access handles
are unavailable (iOS 15.2–16.3 / older WebViews) — it falls back to the async
OPFS backend, which is still durable, rather than logging a misleading error.
This makes the mobile-webview hosting path (exploration 0238) legible: hosts can
branch on capability and target the right minimum OS.
