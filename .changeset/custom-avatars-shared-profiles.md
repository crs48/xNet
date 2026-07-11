---
'@xnetjs/data': minor
---

Profiles gain a canonical deterministic node ID and room for inline avatar images:

- New `profileNodeId(did)` / `didFromProfileNodeId(nodeId)` helpers — a DID's canonical Profile now lives at `profile-<did>` (same pattern as `inboxStateNodeId`), so any collaborator who knows a DID (e.g. from `createdBy` on shared content) can acquire the profile without a directory lookup.
- `Profile.avatar` max length raised from 500 to 65536 so a small, client-side-downscaled `data:image/*` avatar can live inside the Profile node itself and reach share recipients through the same sync path as the display name.
