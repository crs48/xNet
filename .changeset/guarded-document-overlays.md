---
'@xnetjs/data': minor
'@xnetjs/workbench': minor
---

Add bounded device-local document overlays to the data store subpath so hosts can
commit document edits with conditional authority checks. Memory and SQLite reads
and snapshot saves preserve accepted edits across stale writes and restarts.

Chat extensions can use separately approved plain-paragraph document editors and
read task/page properties in approved nested folders and membership-checked spaces.
Raw documents, shared writes, and host storage remain unavailable to extensions.
