---
'@xnetjs/crypto': minor
'@xnetjs/sync': minor
'@xnetjs/data': minor
'@xnetjs/runtime': minor
---

Bulk changes: batched push frames and batch commits (exploration 0357)

Large imports, deletes, and migrations are still N changes (one per node) —
that is what makes per-node history, per-property LWW, and selective sync
work — but they no longer pay a per-change price on the wire or in
verification.

- `@xnetjs/crypto` adds `verifyFast`/`verifyMany`, backed by WebCrypto
  Ed25519 where the runtime has it (~13x faster than the pure-JS verifier,
  measured 101µs vs 1374µs), with an automatic fallback.
- `@xnetjs/sync` adds `BatchCommit`: one signature covering up to 1000
  ordered change hashes, so verifying a batch costs one signature check plus
  the hash recomputations a verifier already owes. Additive — the change
  record, its hash recipe, and LWW ordering are unchanged.
- `.xnetpack` bundles now carry `commits.ndjson`; importing a self-export
  verifies with one signature per 1000 changes instead of one per change.
  Bundles without it import exactly as before.
- Clients batch outbound changes into `node-change-batch` frames when the hub
  advertises `batch-push`, and fall back to one frame per change otherwise.
  Hub ingest of 10,000 changes drops from ~250s (wire-bound) to 570ms.

Batching is transport and authentication only: every change is still verified,
authorized, quota-checked, and LWW-applied individually.
