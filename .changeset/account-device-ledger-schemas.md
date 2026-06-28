---
'@xnetjs/data': minor
---

Add the account/device ledger schemas (explorations 0149 + 0243, Phase 2 foundation):
`AccountRecord`, `DeviceRecord`, `RecoveryRecord`, and `RevocationRecord`. A stable
account subject owns a set of records describing which devices may act as the account,
which recovery methods exist, and which keys are revoked (with `status` + `epoch` for
revocation), so the cloud billing binding can later pin to the account root instead of
a single device DID.

Ships with deterministic ids (`accountRecordId` / `deviceRecordId` / …) and the pure
authorization resolution the hub will enforce — `resolveActiveDevices` and
`isDeviceAuthorized` ("is this device currently authorized for this account?"). The
records are authorization-exempt at the schema level because access is controller-
signed and epoch-gated (hub-enforced), not a per-node role cascade; signing enforcement
and the binding migration are follow-ups.
