---
'@xnetjs/sync': patch
---

Housekeeping: declare `fast-check` as an explicit devDependency instead of
relying on hoisting (dead-code gate hygiene, exploration 0294). No runtime or
API change.
