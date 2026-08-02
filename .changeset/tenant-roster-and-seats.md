---
'@xnetjs/entitlements': minor
---

Seat helpers for tenant rosters: `seatsUsed()` and `canAdmitMember()`, plus a `TenantMemberRole` in which `guest` is admitted but never billed. A seat is capacity provisioned for a collaborator, not an audience member the customer brought — so a flat-billed plan is never capped, and enforcement refuses admission rather than evicting anyone already connected.
