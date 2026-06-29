---
'@xnetjs/data': minor
---

Add account/device ledger operations (explorations 0149 + 0243, Phase 2): pure
builders that turn a ledger intent into the deterministic node to upsert —
`createAccountRecord`, `admitDeviceRecord`, `revokeDeviceRecord` /
`revokeSubjectRecord` (which bumps the account epoch), plus `accountState` to resolve
the current epoch and the set of devices that may currently act as an account. These
are the rules the store/hub wiring and the content-key re-wrap will call; keeping them
pure makes device admit/revoke unit-testable on its own.
