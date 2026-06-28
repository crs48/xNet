---
'@xnetjs/identity': minor
---

Add recoverable-identity primitives so a lost passkey no longer means lost data
(exploration 0243, Phase 1). A recovery phrase now deterministically reproduces the
same DID and the same X25519 encryption key on any device — which is what gates
access to end-to-end-encrypted data — so typing the phrase restores your workspace
without any custodial escrow.

New exports from `@xnetjs/identity`:

- `generateRecoveryPhrase()` / `validateRecoveryPhrase()` — mint and check phrases
  against the recovery wordlist (now exported as `RECOVERY_WORDLIST`); defaults to a
  24-word (~144-bit) phrase.
- `recoveryPhraseToBundle()` / `didForRecoveryPhrase()` / `createRecoverableIdentity()`
  — derive a full key bundle (or just the DID) from a phrase; identical on every
  device.
- `sealRecoveryPhrase()` / `openRecoveryPhrase()` — encrypt a phrase at rest so it can
  be re-shown later behind a passkey gate.

These are pure (no WebAuthn/storage); the IdentityManager and onboarding wiring land
in a follow-up.
