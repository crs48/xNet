---
'@xnetjs/entitlements': minor
'@xnetjs/cloud': minor
'@xnetjs/hub': minor
---

Tenant rosters and seat enforcement. `@xnetjs/entitlements` gains `seatsUsed()` and `canAdmitMember()`, plus a `TenantMemberRole` in which `guest` is admitted but never billed — a seat is capacity provisioned for a collaborator, not an audience member the customer brought. The hub's managed-AI forwarder now presents a per-tenant `XNET_CLOUD_GATEWAY_TOKEN` instead of a fleet-wide secret plus a tenant-id header, and the Cloud Run provisioner can mint R2 credentials scoped to one tenant's prefix and run each service under its own service account.
