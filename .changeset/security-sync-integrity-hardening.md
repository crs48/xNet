---
'@xnetjs/sync': minor
---

Harden the sync-integrity primitives so look-alike helpers no longer give false
assurance (exploration 0307):

- `verifyIntegrity` now performs **real Ed25519 signature verification** against
  the key recovered from each change's author DID (previously it only checked
  that the signature field was non-empty). It accepts an optional `resolveKey`
  override; the default is self-certifying `did:key` resolution.
- `attemptRepair`'s `recompute-hash` action — which overwrites a change's stored
  hash and can launder tampered payloads — is now gated behind an explicit
  `{ trustHashRecompute: true }` opt-in and refused by default.
- `AuthorizedYjsSyncProvider.handleRemoteUpdate` now enforces the Yjs update
  size cap before applying, and `validateChain` / the handler registry /
  `quickIntegrityCheck` document that they are structural-only and do not
  authenticate authorship.
