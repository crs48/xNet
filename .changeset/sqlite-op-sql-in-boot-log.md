---
'@xnetjs/sqlite': patch
---

Boot diagnostics: name every scheduled SQLite op in the boot log (exploration
0249). The `WorkerScheduler` op report gains an optional `detail` field and
`schedule()` an optional `detail` argument; the web worker now forwards each
read/write op's whitespace-collapsed, **param-free** SQL text so a long `execMs`
line names the exact statement instead of the generic `query` label. This is the
missing field that kept the ~15 s cold-open stall unidentified across
explorations 0227–0233. Additive and backward compatible — `detail` is optional
and only emitted when boot debug (`xnet:boot:debug`) is on.
