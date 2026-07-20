---
'@xnetjs/data': minor
'@xnetjs/runtime': minor
---

Public-interaction policy resolution and the replication trust gate (explorations 0378/0258/0383).

- `@xnetjs/data`: new `publicInteractionPolicyId(targetId)` — the deterministic node id for a target's `PublicInteractionPolicy`, so servers resolve "what may strangers do to this node?" with one O(1) read and re-publishing a policy upserts instead of duplicating.
- `@xnetjs/runtime`: `MultiHubSyncManager.publishScoped` now enforces the 0258 trust tiers — plaintext payloads are withheld from `zero-knowledge` destinations and the call returns `{ published, withheld }` (previously `void`); new `mayReceivePayload(trust, payload)` and `PayloadClass` export the rule. Pass `{ payload: 'ciphertext' }` for recipient-scoped envelopes, which may go anywhere.
