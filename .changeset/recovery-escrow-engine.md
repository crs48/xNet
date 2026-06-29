---
'@xnetjs/identity': minor
---

Add the privacy-preserving recovery-escrow primitive (exploration 0243, P3.1). Escrow
lets a user recover without keeping a long recovery phrase, but **without letting the
cloud read their data alone**: `sealEscrow`/`openEscrow` encrypt the recovery `backupKey`
under a user-held PIN (plus `serializeEscrow`/`deserializeEscrow` for the opaque blob the
cloud KMS-wraps). Recovery then needs *both* a verified WorkOS session (the cloud's KMS
factor) and the PIN (the user's factor). A new `@xnetjs/cloud/escrow` module holds the
cloud half (`EscrowStore`, injected `KmsWrapper`, and `enable`/`disable`/`recover` with
session-gating — escrow is absent unless enabled and unreachable without a verified
session). The fully-custodial "cloud can recover from the login alone" variant is
deliberately not built; it needs an explicit product decision (see the design note).
