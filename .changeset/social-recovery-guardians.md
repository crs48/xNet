---
'@xnetjs/identity': minor
---

Add social-recovery ("guardians") methods to the `IdentityManager` (exploration 0243) —
the Apple-ADP "recovery contacts" analogue, built on the Shamir secret-sharing already
in `seed-recovery.ts`. `createGuardianShares(config)` splits a recoverable identity's
phrase into `totalShares` shares of which any `threshold` reconstruct it (prompting for
the passkey to read the phrase); `recoverFromGuardianShares(shares)` reconstructs the
phrase from enough shares on a new device, reproduces the same DID, and enrolls a local
passkey. Recovery is entirely user-to-user — the cloud is never involved, so it stays
zero-knowledge and non-coercible by construction.
