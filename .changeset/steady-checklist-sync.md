---
'@xnetjs/react': patch
---

Checklist→task reconciliation (`usePageTaskSync` / `useCanvasTaskSync`) no
longer runs before the editor publishes its first snapshot for the current
host — a mount race could archive every hosted task and a reused surface
could reconcile the previous page's snapshot after navigation. The
`'Untitled task'` extraction fallback emitted transiently by delete
gestures can no longer overwrite a task's real title, in diff updates or
cross-page claims.
