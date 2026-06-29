---
'@xnetjs/identity': minor
'@xnetjs/react': minor
---

Surface synced-passkey recovery in onboarding (exploration 0243, P1.4). The
`IdentityManager` gains `recoverViaSyncedPasskey()`, which discovers an xNet passkey
synced from another device (iCloud Keychain / Google Password Manager), unlocks it
(same PRF → same DID), and stores it locally — returning null when none is available so
the caller can fall back to the recovery phrase. The import screen now leads with a
"Use a synced passkey" option (new `USE_SYNCED_PASSKEY` onboarding event), giving
same-ecosystem users a phrase-free return path.
