/**
 * Replication scope — the Space→namespace shim that lets the (already built)
 * `planReplicationDestinations` router key on something the runtime actually
 * addresses (exploration 0258).
 *
 * The routing planner in `@xnetjs/sync` speaks in *namespaces* (strings like
 * `xnet://<did>/space/<id>/`), but the runtime addresses per-node rooms
 * (`xnet-doc-<nodeId>`). Nothing mapped one to the other, so the planner sat
 * exported-but-unconsumed. A **Space** is the natural bridge: it is already the
 * security boundary, every content node carries a single `space` relation, and
 * a human reasons about "where does *this Space* live?". So the Space is the
 * unit of replication, and its namespace is the routing key.
 *
 * This module also carries the "manifest as data" bridge:
 * `replicationConfigFromPolicies` turns a set of per-Space replication policies
 * (which can themselves be synced nodes) into the `SyncReplicationConfig` the
 * planner consumes — so *editing where a Space lives* is ordinary data, not
 * device-local config.
 */

import type {
  SyncFederationHub,
  SyncFederationNamespacePolicy,
  SyncReplicationConfig
} from '@xnetjs/sync'

/**
 * Trust class of a replication destination. A `trusted` hub holds plaintext and
 * can index/search/serve; a `zero-knowledge` hub holds only recipient-scoped
 * ciphertext and can relay but not read. The plaintext gate is ENFORCED at the
 * publish path (`MultiHubSyncManager.publishScoped` withholds plaintext from
 * zero-knowledge destinations — 0258, closed by 0383 W4); this predicate is
 * the single definition of the rule.
 */
export type ReplicaTrust = 'trusted' | 'zero-knowledge'

/** Payload classification for the plaintext gate. */
export type PayloadClass = 'plaintext' | 'ciphertext'

/**
 * May a destination of this trust class receive a payload of this class?
 * Undefined trust is treated as `trusted` for compatibility with existing
 * configs that never declared a class — tightening that default is a breaking
 * change to make deliberately, not silently.
 */
export function mayReceivePayload(trust: ReplicaTrust | undefined, payload: PayloadClass): boolean {
  if (payload === 'ciphertext') return true
  return trust !== 'zero-knowledge'
}

/** The namespace for a Space's content — the routing key for the planner. */
export function spaceNamespace(ownerDID: string, spaceId: string): string {
  return `xnet://${ownerDID}/space/${spaceId}/`
}

/**
 * The namespace for a user's system data (schemas, authz, the manifest itself).
 * Classified `system` by the planner (the `sys/` segment), so it can route to
 * `defaultSystemHubIds` and be replicated everywhere for bootstrap.
 */
export function systemNamespace(ownerDID: string): string {
  return `xnet://${ownerDID}/sys/`
}

/** Minimal node shape the scope mapping needs. */
export interface ReplicationScopeNode {
  id: string
  /** The Space this node's security lives in, if any. */
  space?: string | null
  /** Author DID; scopes the namespace when no explicit owner is given. */
  createdBy?: string | null
}

/**
 * The replication namespace for a node: its Space's namespace when it has one,
 * otherwise a self-scoped namespace under its owner (so an unfiled node still
 * has a stable, owner-scoped routing key).
 */
export function namespaceForNode(node: ReplicationScopeNode, fallbackOwnerDID?: string): string {
  const owner = node.createdBy ?? fallbackOwnerDID ?? 'unknown'
  return node.space ? spaceNamespace(owner, node.space) : spaceNamespace(owner, node.id)
}

/** One destination in a Space's replication manifest. */
export interface ReplicationDestinationSpec {
  /** Stable hub id used by routing policies. */
  hubId: string
  /** WebSocket URL for the hub. */
  url: string
  /** Lower is preferred when a `maxHubs` cap prunes a plan. */
  priority?: number
  /**
   * Trust class of this destination. Reserved for the plaintext vs
   * zero-knowledge replication gate (0258); recorded on the manifest but not
   * yet enforced.
   */
  trust?: ReplicaTrust
  /** Minimum replica count this Space wants (feeds the planner's `minHubs`). */
  minReplicas?: number
}

/**
 * A per-Space replication policy — the "manifest of what goes where" as data.
 * A group of these can be persisted as synced nodes; this module turns them
 * into the config the planner consumes.
 */
export interface SpaceReplicationPolicy {
  /** The Space id (the replication scope). */
  space: string
  /** Owner DID that scopes the Space's namespace. */
  ownerDID: string
  /** Where this Space replicates. */
  destinations: readonly ReplicationDestinationSpec[]
}

/**
 * Build a `SyncReplicationConfig` from a set of per-Space replication policies.
 *
 * Each policy contributes:
 *  - its destinations to a shared hub inventory (deduped by `hubId`), and
 *  - a namespace policy for `spaceNamespace(ownerDID, space)` that includes
 *    exactly those hubs, with `minHubs` set to the largest `minReplicas` any of
 *    its destinations asks for.
 *
 * The result is a *pure function of the manifest*: change a policy and the plan
 * changes deterministically, which is what makes "manifest as data" work.
 */
export function replicationConfigFromPolicies(
  policies: readonly SpaceReplicationPolicy[]
): SyncReplicationConfig {
  const hubsById = new Map<string, SyncFederationHub>()
  const namespacePolicies: SyncFederationNamespacePolicy[] = []

  for (const policy of policies) {
    const includeHubIds: string[] = []
    let minReplicas = 0

    for (const destination of policy.destinations) {
      if (!hubsById.has(destination.hubId)) {
        hubsById.set(destination.hubId, {
          id: destination.hubId,
          url: destination.url,
          ...(destination.priority === undefined ? {} : { priority: destination.priority })
        })
      }
      includeHubIds.push(destination.hubId)
      if (destination.minReplicas && destination.minReplicas > minReplicas) {
        minReplicas = destination.minReplicas
      }
    }

    namespacePolicies.push({
      namespace: spaceNamespace(policy.ownerDID, policy.space),
      includeHubIds,
      ...(minReplicas > 0 ? { minHubs: minReplicas } : {})
    })
  }

  return {
    federation: {
      hubs: [...hubsById.values()],
      namespacePolicies
    }
  }
}
