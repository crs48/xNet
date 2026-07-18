---
'@xnetjs/identity': minor
'@xnetjs/data': minor
'@xnetjs/react': minor
---

OAuth + shared global identity (exploration 0338).

New, additive public surface — nothing removed or renamed:

- `@xnetjs/identity`: ATProto bridge (`@xnetjs/identity` re-exports
  `parseAnyDid`/`isAtprotoDid`/`createAtprotoBinding`/`verifyAtprotoBinding`,
  represent-only foreign DIDs — `parseDID` signing guarantees unchanged), the
  `net.x.identity.binding` record, `derivePlcRotationKey` +
  `withUserPriorityRotationKey` (user-priority did:plc rotation key from the
  recovery seed), the `RecoveryAnchorProvider` contract, and `ucanTokenId` +
  a per-token `nonce` on `createUCAN` (0307-B least-privilege/revocation).
- `@xnetjs/data`: `ProfileSchema` gains `atprotoDid`/`atprotoHandle`/
  `atprotoBindingUri`; new `evaluateLedgerWrite` account-ledger enforcement
  helpers.
- `@xnetjs/react`: onboarding gains the ATProto login-door state + the
  injectable `RunAtprotoCeremony` contract ("Continue with Bluesky / any PDS").
