---
'@xnetjs/identity': minor
'@xnetjs/react': minor
---

Wire social recovery ("trusted guardians") into the UI (exploration 0243) — xNet's
Apple-recovery-contacts analogue. Settings → Account can split a recoverable identity
into 3 guardian share codes (any 2 recover it), and onboarding gains a "Recover with
guardian shares" path that reconstructs the identity from enough codes on a new device.
`@xnetjs/identity` adds `serializeShare` / `parseShare` for the copy-pasteable
`xnet-share:…` codes. Recovery is entirely user-to-user; the cloud is never involved.
