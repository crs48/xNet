# Moderation integration — local prototype

Implements the usable first and second stages of exploration 0500 on the current local branch.
Independent labeler federation, specialist classifiers, youth onboarding and a new E2EE protocol
remain later decisions, as the exploration specifies. No deployment or public service is authorized.

- [x] Durable personal hides, author mutes, topic filters and contact blocks, with undo.
- [x] Explicit file hosting approval, stop-seeding controls and provider withdrawal.
- [x] Signed registry moderation requests with configured moderator keys; no self-appointed admins.
- [x] Durable reports, scoped restrictions, notices, appeals and reversals with an audit history.
- [x] Consistent registry catalog/direct-ID enforcement and authenticated policy propagation to peers.
- [x] Enforce policy when issuing playback tickets, serving ranges/chunks and advertising providers.
- [x] Room rules, moderators, membership removal, invite rotation, slow mode and newcomer approval.
- [x] Selected-message reporting with disclosure preview; reports/appeals remain available when paused.
- [x] Desktop Safety & moderation UI, per-item controls, reports/review and room management.
- [x] Integration tests for forged authority, replay, cross-scope access, ticket bypass, persistence,
      appeals/reversal, revoked membership and private evidence boundaries.
- [x] Build and drive both native profiles through public and private moderation flows.
- [x] Update exploration checklists, local documentation and verification.
- [x] Create the local implementation commit with required hooks; no push or merge.

Public registry policy uses a signed short lease pinned on first use. This experiment's single
registry remains an availability dependency for fresh operator policy. Old content already copied
cannot be remotely erased. Reports are not automatically treated as violations. Private-room
transport is encrypted but the current protocol is not end-to-end encrypted against the room owner.
