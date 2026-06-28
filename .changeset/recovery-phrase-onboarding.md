---
'@xnetjs/react': minor
---

Wire opt-in recovery phrases into onboarding (exploration 0243, Phase 1). The welcome
screen gains a "Set up a recovery phrase too" option that mints a recoverable identity
and shows the phrase once to save; the "Enter recovery phrase" path now validates the
phrase against the wordlist and recovers the same identity on a new device (enrolling a
local passkey to gate it). New machine states `creating-recoverable` /
`show-recovery-phrase` and events `CREATE_RECOVERABLE` / `SUBMIT_PHRASE` /
`RECOVERABLE_CREATED` / `PHRASE_SAVED` / `IMPORT_FAILED`.
