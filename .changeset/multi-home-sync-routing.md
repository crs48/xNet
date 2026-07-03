---
'@xnetjs/runtime': minor
---

Add `createMultiHubSyncManager` plus `replication-scope` helpers (`spaceNamespace`, `systemNamespace`, `namespaceForNode`, `replicationConfigFromPolicies`) — the policy-driven selective-routing layer for multi-home sync (exploration 0258). Given a Space's namespace it consults `@xnetjs/sync`'s `planReplicationDestinations` and joins/publishes a room on only the hubs the policy selects (defaulting to a full mirror), routing over the existing multiplexed per-hub transports. Purely additive; the live single-hub path is unchanged.
