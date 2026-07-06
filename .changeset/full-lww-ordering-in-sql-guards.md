---
'@xnetjs/data': patch
'@xnetjs/sqlite': patch
---

SQL property upserts now enforce the full LWW ordering triple (Lamport →
wallTime → author code-units), matching the in-memory `shouldReplace`
comparator. The previous lamport-only guard let arrival order decide
same-Lamport concurrent edits, so two replicas that received the same
conflicting changes in different orders could permanently disagree on the
materialized value. Applies to the per-change upsert, the batched
`applyNodeBatch` path, and the native web/electron batch adapters.
