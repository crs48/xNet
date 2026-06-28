---
'@xnetjs/identity': minor
---

Add opt-in recoverable identities to the `IdentityManager` (exploration 0243, Phase 1).
A recoverable identity is born from a recovery phrase and gated by a passkey, so it can
be rebuilt on any device by typing the phrase — without weakening the default, which
stays the stronger PRF-derived identity that stores nothing at rest.

New `IdentityManager` methods:

- `createRecoverable()` — mint a new identity from a fresh phrase, enroll a gating
  passkey, and return the phrase to show once.
- `importRecoveryPhrase(phrase)` — adopt an identity from a phrase on a new device
  (lost passkey), reproducing the same DID and X25519 key.
- `exportRecoveryPhrase()` — reveal the phrase behind a passkey gate (Settings "view
  phrase"); returns null for non-recoverable identities.
- `isRecoverable()` — whether the stored identity has a saved phrase.

The sealed phrase is persisted alongside the encrypted bundle (`storeIdentity` gains an
optional `recovery` arg). Also exports `enrollRecoverableIdentity`.
