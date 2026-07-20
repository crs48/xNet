/**
 * MultiHubSyncManager — the selective-routing brain for multi-home sync
 * (exploration 0258).
 *
 * The pieces for multiplayer already existed but weren't joined up:
 *  - `@xnetjs/sync`'s `planReplicationDestinations` decides *which hubs* a
 *    namespace should replicate to — but nothing called it.
 *  - `createMultiHubConnectionManager` already fans a *multiplexed* connection
 *    (O(1) sockets per hub, not per doc) out to N hubs — but it publishes to
 *    *every* hub unconditionally, with no per-scope selection.
 *
 * This manager sits between them: given a namespace (a Space's, via
 * `replication-scope`), it consults the planner and joins/publishes a room on
 * *only the hubs the policy selects*. With no policy it defaults to a full
 * mirror (every configured hub), which is the safe local-first default —
 * "back up everything to all your hubs" — and selective routing kicks in the
 * moment a namespace policy is present.
 *
 * Because it routes over the existing multiplexed transports rather than
 * opening a socket per (doc × hub), it does not reintroduce the connection
 * explosion the exploration warned about.
 *
 * The transports are injected (any object with join/publish/connect), so the
 * routing logic is unit-testable without real WebSockets, and the real caller
 * passes `createConnectionManager(...)` per hub.
 */

import { mayReceivePayload, type PayloadClass, type ReplicaTrust } from './replication-scope'
import {
  planReplicationDestinations,
  type ReplicationPlan,
  type SyncFederationHub,
  type SyncReplicationConfig
} from '@xnetjs/sync'

/** The slice of a hub connection this manager drives (a `ConnectionManager` fits). */
export interface HubTransport {
  connect(): void
  disconnect(): void
  /** Subscribe to a room; returns an unsubscribe function. */
  joinRoom(room: string, handler: (data: Record<string, unknown>) => void): () => void
  /** Publish a message to a room. */
  publish(room: string, data: object): void
}

/** One hub the manager can route to. */
export interface HubConnection {
  /** Stable hub id referenced by routing policies. */
  hubId: string
  /** WebSocket URL (also used to overlay any policy hub entry by id). */
  url: string
  /** The multiplexed transport for this hub. */
  transport: HubTransport
  /**
   * Trust class of this hub. ENFORCED at `publishScoped` (0258/0383 W4): a
   * `zero-knowledge` destination never receives a plaintext payload.
   */
  trust?: ReplicaTrust
}

export interface MultiHubSyncManagerConfig {
  /** One multiplexed connection per hub. */
  hubs: readonly HubConnection[]
  /** Routing policy — the `federation` half is finally consulted here. */
  replication?: SyncReplicationConfig
  /** Map a node id to its wire room. Default: `xnet-doc-<nodeId>`. */
  roomForNode?: (nodeId: string) => string
}

/** A planned destination that the manager actually has a transport for. */
export interface PlannedHub {
  hubId: string
  url: string
  trust: ReplicaTrust | undefined
}

/** Handle for a room joined on the policy-selected hubs. */
export interface ScopedRoomHandle {
  /** The plan that selected these hubs (carries diagnostics + trace). */
  readonly plan: ReplicationPlan
  /** Hub ids this room is currently subscribed on. */
  readonly hubIds: readonly string[]
  /** Leave the room on every hub it was joined on. */
  leave(): void
}

export interface MultiHubSyncManager {
  /** The routing plan for a namespace (all destinations, incl. unknown hubs). */
  planFor(namespace: string): ReplicationPlan
  /** Planned destinations the manager has a transport for. */
  plannedHubs(namespace: string): PlannedHub[]
  /** Hub ids a namespace routes to (and that we can reach). */
  destinationsFor(namespace: string): string[]
  /** Join a node's room on exactly the hubs the policy selects. */
  joinScopedRoom(
    nodeId: string,
    namespace: string,
    handler: (data: Record<string, unknown>) => void
  ): ScopedRoomHandle
  /**
   * Publish to a room on exactly the hubs the namespace routes to. The 0258
   * trust gate is enforced here: plaintext payloads (the default class) are
   * WITHHELD from `zero-knowledge` destinations; pass `payload: 'ciphertext'`
   * for recipient-scoped envelopes, which may go anywhere. Returns which hubs
   * received and which were withheld, so callers can surface the gap instead
   * of silently under-replicating.
   */
  publishScoped(
    namespace: string,
    room: string,
    data: object,
    opts?: { payload?: PayloadClass }
  ): { published: string[]; withheld: string[] }
  /** Replace the routing policy; live rooms re-route to match (manifest-as-data). */
  setReplication(replication: SyncReplicationConfig | undefined): void
  /** Connect every hub transport. */
  connect(): void
  /** Leave every room and disconnect every hub transport. */
  disconnect(): void
}

interface ActiveRoom {
  nodeId: string
  namespace: string
  room: string
  handler: (data: Record<string, unknown>) => void
  /** hubId → unsubscribe. */
  subscriptions: Map<string, () => void>
}

const defaultRoomForNode = (nodeId: string): string => `xnet-doc-${nodeId}`

export function createMultiHubSyncManager(config: MultiHubSyncManagerConfig): MultiHubSyncManager {
  const hubs = new Map<string, HubConnection>()
  for (const hub of config.hubs) {
    if (hub.hubId && !hubs.has(hub.hubId)) hubs.set(hub.hubId, hub)
  }
  const roomForNode = config.roomForNode ?? defaultRoomForNode
  const activeRooms = new Set<ActiveRoom>()
  let replication = config.replication

  /**
   * Effective federation config: seed the hub inventory from the connections we
   * actually hold (so a full mirror is the default), then overlay any policy
   * hub entries by id to pick up priority/kinds/disabled.
   */
  function effectiveConfig(): SyncReplicationConfig {
    const overlays = new Map<string, SyncFederationHub>(
      (replication?.federation?.hubs ?? []).map((hub) => [hub.id, hub])
    )
    const mergedHubs: SyncFederationHub[] = [...hubs.values()].map((hub) => {
      const overlay = overlays.get(hub.hubId)
      return { id: hub.hubId, url: hub.url, ...(overlay ?? {}) }
    })
    // Keep any policy hubs we have no live transport for — the plan may still
    // reference them (they're just skipped when we route).
    for (const [id, overlay] of overlays) {
      if (!hubs.has(id)) mergedHubs.push(overlay)
    }
    return {
      ...(replication?.compatibility ? { compatibility: replication.compatibility } : {}),
      federation: {
        hubs: mergedHubs,
        ...(replication?.federation?.namespacePolicies
          ? { namespacePolicies: replication.federation.namespacePolicies }
          : {}),
        ...(replication?.federation?.defaultSystemHubIds
          ? { defaultSystemHubIds: replication.federation.defaultSystemHubIds }
          : {}),
        ...(replication?.federation?.defaultUserHubIds
          ? { defaultUserHubIds: replication.federation.defaultUserHubIds }
          : {})
      }
    }
  }

  function planFor(namespace: string): ReplicationPlan {
    return planReplicationDestinations({ namespace, config: effectiveConfig() })
  }

  /** Planned hub ids restricted to those we hold a live transport for. */
  function reachableHubIds(namespace: string): string[] {
    return planFor(namespace)
      .destinations.map((destination) => destination.hubId)
      .filter((hubId) => hubs.has(hubId))
  }

  /** Re-evaluate one active room against the current policy, adding/dropping hubs. */
  function reconcileRoom(room: ActiveRoom): void {
    const wanted = new Set(reachableHubIds(room.namespace))
    // Drop hubs no longer selected.
    for (const [hubId, unsubscribe] of room.subscriptions) {
      if (!wanted.has(hubId)) {
        unsubscribe()
        room.subscriptions.delete(hubId)
      }
    }
    // Add newly selected hubs.
    for (const hubId of wanted) {
      if (!room.subscriptions.has(hubId)) {
        const hub = hubs.get(hubId)
        if (hub) room.subscriptions.set(hubId, hub.transport.joinRoom(room.room, room.handler))
      }
    }
  }

  return {
    planFor,

    plannedHubs(namespace: string): PlannedHub[] {
      return planFor(namespace).destinations.flatMap((destination) => {
        const hub = hubs.get(destination.hubId)
        return hub ? [{ hubId: hub.hubId, url: hub.url, trust: hub.trust }] : []
      })
    },

    destinationsFor: reachableHubIds,

    joinScopedRoom(nodeId, namespace, handler): ScopedRoomHandle {
      const room = roomForNode(nodeId)
      const active: ActiveRoom = {
        nodeId,
        namespace,
        room,
        handler,
        subscriptions: new Map()
      }
      for (const hubId of reachableHubIds(namespace)) {
        const hub = hubs.get(hubId)
        if (hub) active.subscriptions.set(hubId, hub.transport.joinRoom(room, handler))
      }
      activeRooms.add(active)

      return {
        plan: planFor(namespace),
        get hubIds() {
          return [...active.subscriptions.keys()]
        },
        leave() {
          for (const unsubscribe of active.subscriptions.values()) unsubscribe()
          active.subscriptions.clear()
          activeRooms.delete(active)
        }
      }
    },

    publishScoped(namespace, room, data, opts) {
      const payload = opts?.payload ?? 'plaintext'
      const published: string[] = []
      const withheld: string[] = []
      for (const hubId of reachableHubIds(namespace)) {
        const hub = hubs.get(hubId)
        if (!hub) continue
        if (!mayReceivePayload(hub.trust, payload)) {
          withheld.push(hubId)
          continue
        }
        hub.transport.publish(room, data)
        published.push(hubId)
      }
      return { published, withheld }
    },

    setReplication(next): void {
      replication = next
      for (const room of activeRooms) reconcileRoom(room)
    },

    connect(): void {
      for (const hub of hubs.values()) hub.transport.connect()
    },

    disconnect(): void {
      for (const room of activeRooms) {
        for (const unsubscribe of room.subscriptions.values()) unsubscribe()
        room.subscriptions.clear()
      }
      activeRooms.clear()
      for (const hub of hubs.values()) hub.transport.disconnect()
    }
  }
}
