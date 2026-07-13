---
'@xnetjs/data': patch
'@xnetjs/sqlite': patch
---

Fix "no such column: p.tiebreak_key" on databases created before schema v8. The
`tiebreak_key` column repair now runs before the first `node_properties` read
(`getNode`/`getNodes`/`listNodes`/`queryNodes`), not just before writes — a
fresh session that opened a document page hit the missing column on its first
hydrate query before any write could trigger the lazy guard. Also adds the
missing v8 entry to `SCHEMA_MIGRATIONS` (`ALTER TABLE node_properties ADD
COLUMN tiebreak_key TEXT`).
