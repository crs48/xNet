---
'@xnetjs/data': minor
---

Additive schema fields for per-deployment crash consoles (exploration 0341): `DebugReport` gains `issueKey` (release-independent grouping key, so per-release fingerprint splits stay deliberate while the console can group an issue's whole history) and `escalatedId` (the vendor `XR-…` handle stamped after an operator escalates a report); `SpaceMembership` gains an optional `expiresAt` for time-boxed grants such as vendor support access to a Diagnostics Space. All three are optional — existing nodes and callers are unaffected.
