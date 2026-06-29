---
'@xnetjs/data': minor
---

Add account/device content-key re-wrap to `computeRecipients` (exploration 0243, P2.3).
A new optional `expandDeviceRecipients` dependency lets each DID recipient expand to
every *currently active* device of the account it belongs to, so a user's content is
decryptable on all their devices: admitting a device (a `DeviceRecord`) makes it a
recipient on the next recompute, and revoking it removes it from future re-wraps.
Build the function from ledger records with the new `deviceRecipientExpander`. When the
dependency is omitted, recipients are exactly the resolved DIDs (no behavior change),
and an identity that belongs to no account expands to only itself — so an unrelated DID
never gains access to another account's data.
