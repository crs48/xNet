---
'@xnetjs/sqlite': patch
---

Memory-map OPFS reads (`PRAGMA mmap_size`) on the web adapter so the first cold
query after a reload faults its working-set pages via the OS instead of
thousands of synchronous 8 KiB reads on the single worker thread (exploration
0233). The boot trace caught one cold landing query taking 15.8 s of pure
execution while every later warm query was 0 ms — the page cache only helps
re-reads, so mmap is the lever for the first read. Guarded: a no-op where the
`opfs-sahpool` VFS doesn't support it.
