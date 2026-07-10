# @xnetjs/identity

## 0.9.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.9.0
  - @xnetjs/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.8.0
  - @xnetjs/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.7.0
  - @xnetjs/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.6.0
  - @xnetjs/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.5.0
  - @xnetjs/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.4.0
  - @xnetjs/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`92708ab`](https://github.com/crs48/xNet/commit/92708ab09f2334b1ee02fef4cea654c1aed6b0ed)]:
  - @xnetjs/core@0.3.0
  - @xnetjs/crypto@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.2.0
  - @xnetjs/core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.1.2
  - @xnetjs/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.1.1
  - @xnetjs/core@0.1.1

## 0.1.0

### Minor Changes

- [#339](https://github.com/crs48/xNet/pull/339) [`4fb460a`](https://github.com/crs48/xNet/commit/4fb460a24061f818d3f99a166876d9cd1b3d7544) Thanks [@crs48](https://github.com/crs48)! - Wire social recovery ("trusted guardians") into the UI (exploration 0243) — xNet's
  Apple-recovery-contacts analogue. Settings → Account can split a recoverable identity
  into 3 guardian share codes (any 2 recover it), and onboarding gains a "Recover with
  guardian shares" path that reconstructs the identity from enough codes on a new device.
  `@xnetjs/identity` adds `serializeShare` / `parseShare` for the copy-pasteable
  `xnet-share:…` codes. Recovery is entirely user-to-user; the cloud is never involved.

- [#320](https://github.com/crs48/xNet/pull/320) [`d7a87da`](https://github.com/crs48/xNet/commit/d7a87daf84ea86d6d26eed3fd61314a60e1d7cbf) Thanks [@crs48](https://github.com/crs48)! - Add recoverable-identity primitives so a lost passkey no longer means lost data
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

- [#322](https://github.com/crs48/xNet/pull/322) [`fc3aa1d`](https://github.com/crs48/xNet/commit/fc3aa1dba2cf40844ca38f7cc816cddc981d9022) Thanks [@crs48](https://github.com/crs48)! - Add opt-in recoverable identities to the `IdentityManager` (exploration 0243, Phase 1).
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

- [#335](https://github.com/crs48/xNet/pull/335) [`5da8d92`](https://github.com/crs48/xNet/commit/5da8d9206797183c69dc7c4f3aae3e1d9cec2e5a) Thanks [@crs48](https://github.com/crs48)! - Add the privacy-preserving recovery-escrow primitive (exploration 0243, P3.1). Escrow
  lets a user recover without keeping a long recovery phrase, but **without letting the
  cloud read their data alone**: `sealEscrow`/`openEscrow` encrypt the recovery `backupKey`
  under a user-held PIN (plus `serializeEscrow`/`deserializeEscrow` for the opaque blob the
  cloud KMS-wraps). Recovery then needs _both_ a verified WorkOS session (the cloud's KMS
  factor) and the PIN (the user's factor). A new `@xnetjs/cloud/escrow` module holds the
  cloud half (`EscrowStore`, injected `KmsWrapper`, and `enable`/`disable`/`recover` with
  session-gating — escrow is absent unless enabled and unreachable without a verified
  session). The fully-custodial "cloud can recover from the login alone" variant is
  deliberately not built; it needs an explicit product decision (see the design note).

- [#337](https://github.com/crs48/xNet/pull/337) [`b327f99`](https://github.com/crs48/xNet/commit/b327f99a9448ce8724c09c66058e8e1daadd44bf) Thanks [@crs48](https://github.com/crs48)! - Add social-recovery ("guardians") methods to the `IdentityManager` (exploration 0243) —
  the Apple-ADP "recovery contacts" analogue, built on the Shamir secret-sharing already
  in `seed-recovery.ts`. `createGuardianShares(config)` splits a recoverable identity's
  phrase into `totalShares` shares of which any `threshold` reconstruct it (prompting for
  the passkey to read the phrase); `recoverFromGuardianShares(shares)` reconstructs the
  phrase from enough shares on a new device, reproduces the same DID, and enrolls a local
  passkey. Recovery is entirely user-to-user — the cloud is never involved, so it stays
  zero-knowledge and non-coercible by construction.

- [#333](https://github.com/crs48/xNet/pull/333) [`ddf47b9`](https://github.com/crs48/xNet/commit/ddf47b9cac403b6ff452f47e1a4a9065f393ac1c) Thanks [@crs48](https://github.com/crs48)! - Surface synced-passkey recovery in onboarding (exploration 0243, P1.4). The
  `IdentityManager` gains `recoverViaSyncedPasskey()`, which discovers an xNet passkey
  synced from another device (iCloud Keychain / Google Password Manager), unlocks it
  (same PRF → same DID), and stores it locally — returning null when none is available so
  the caller can fall back to the recovery phrase. The import screen now leads with a
  "Use a synced passkey" option (new `USE_SYNCED_PASSKEY` onboarding event), giving
  same-ecosystem users a phrase-free return path.

### Patch Changes

- Updated dependencies [[`d6d0470`](https://github.com/crs48/xNet/commit/d6d047022b8a77b7a3e7453869fb42cbeb73f4a4)]:
  - @xnetjs/core@0.1.0
  - @xnetjs/crypto@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @xnetjs/crypto@0.0.3
  - @xnetjs/core@0.0.3

## 0.0.2

### Patch Changes

- cd2a564: Set up automated npm publishing via Changesets and GitHub Actions trusted publishing, and standardize package publish metadata (public access, provenance, files, and dist entrypoints) for the initial @xnetjs release set including the React package chain.
- Updated dependencies [cd2a564]
  - @xnetjs/crypto@0.0.2
  - @xnetjs/core@0.0.2
