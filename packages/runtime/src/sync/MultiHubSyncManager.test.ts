import type { SyncReplicationConfig } from '@xnetjs/sync'
import { describe, expect, it } from 'vitest'
import { createMultiHubSyncManager, type HubTransport } from './MultiHubSyncManager'
import { spaceNamespace } from './replication-scope'

const ALICE = 'did:key:zAlice'

/** Records every join/publish/lifecycle call so tests can assert routing. */
class FakeTransport implements HubTransport {
  connected = false
  readonly joinedRooms = new Map<string, number>()
  readonly published: Array<{ room: string; data: object }> = []

  connect(): void {
    this.connected = true
  }

  disconnect(): void {
    this.connected = false
  }

  joinRoom(room: string, _handler: (data: Record<string, unknown>) => void): () => void {
    this.joinedRooms.set(room, (this.joinedRooms.get(room) ?? 0) + 1)
    return () => {
      const count = (this.joinedRooms.get(room) ?? 0) - 1
      if (count <= 0) this.joinedRooms.delete(room)
      else this.joinedRooms.set(room, count)
    }
  }

  publish(room: string, data: object): void {
    this.published.push({ room, data })
  }

  isJoined(room: string): boolean {
    return (this.joinedRooms.get(room) ?? 0) > 0
  }
}

function setup(replication?: SyncReplicationConfig) {
  const personal = new FakeTransport()
  const community = new FakeTransport()
  const manager = createMultiHubSyncManager({
    hubs: [
      { hubId: 'personal', url: 'wss://personal.example', transport: personal, trust: 'trusted' },
      {
        hubId: 'community',
        url: 'wss://community.example',
        transport: community,
        trust: 'zero-knowledge'
      }
    ],
    replication
  })
  return { manager, personal, community }
}

describe('MultiHubSyncManager', () => {
  it('defaults to a full mirror (every hub) when no policy is set', () => {
    const { manager } = setup()
    expect(manager.destinationsFor(spaceNamespace(ALICE, 'any')).sort()).toEqual([
      'community',
      'personal'
    ])
  })

  it('routes selectively: private Space to personal only, public to both', () => {
    const replication: SyncReplicationConfig = {
      federation: {
        hubs: [
          { id: 'personal', url: 'wss://personal.example' },
          { id: 'community', url: 'wss://community.example' }
        ],
        namespacePolicies: [
          { namespace: spaceNamespace(ALICE, 'private'), includeHubIds: ['personal'] },
          {
            namespace: spaceNamespace(ALICE, 'public'),
            includeHubIds: ['personal', 'community']
          }
        ]
      }
    }
    const { manager } = setup(replication)

    expect(manager.destinationsFor(spaceNamespace(ALICE, 'private'))).toEqual(['personal'])
    expect(manager.destinationsFor(spaceNamespace(ALICE, 'public')).sort()).toEqual([
      'community',
      'personal'
    ])
  })

  it('joins and publishes a room on only the selected hubs', () => {
    const replication: SyncReplicationConfig = {
      federation: {
        hubs: [
          { id: 'personal', url: 'wss://personal.example' },
          { id: 'community', url: 'wss://community.example' }
        ],
        namespacePolicies: [
          { namespace: spaceNamespace(ALICE, 'private'), includeHubIds: ['personal'] }
        ]
      }
    }
    const { manager, personal, community } = setup(replication)
    const ns = spaceNamespace(ALICE, 'private')

    const handle = manager.joinScopedRoom('node-1', ns, () => {})
    expect(handle.hubIds).toEqual(['personal'])
    expect(personal.isJoined('xnet-doc-node-1')).toBe(true)
    expect(community.isJoined('xnet-doc-node-1')).toBe(false)

    manager.publishScoped(ns, 'xnet-doc-node-1', { type: 'sync-update' })
    expect(personal.published).toHaveLength(1)
    expect(community.published).toHaveLength(0)

    handle.leave()
    expect(personal.isJoined('xnet-doc-node-1')).toBe(false)
  })

  it('surfaces the minimum_hubs_not_satisfied diagnostic when a Space wants more replicas than exist', () => {
    const replication: SyncReplicationConfig = {
      federation: {
        hubs: [{ id: 'personal', url: 'wss://personal.example' }],
        namespacePolicies: [
          {
            namespace: spaceNamespace(ALICE, 'critical'),
            includeHubIds: ['personal'],
            minHubs: 2
          }
        ]
      }
    }
    const { manager } = setup(replication)
    const plan = manager.planFor(spaceNamespace(ALICE, 'critical'))
    expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'minimum_hubs_not_satisfied'
    )
  })

  it('honors a maxHubs cap deterministically by priority', () => {
    const replication: SyncReplicationConfig = {
      federation: {
        hubs: [
          { id: 'personal', url: 'wss://personal.example', priority: 1 },
          { id: 'community', url: 'wss://community.example', priority: 2 }
        ],
        namespacePolicies: [
          {
            namespace: spaceNamespace(ALICE, 'capped'),
            includeHubIds: ['personal', 'community'],
            maxHubs: 1
          }
        ]
      }
    }
    const { manager } = setup(replication)
    // Lowest priority wins the single slot.
    expect(manager.destinationsFor(spaceNamespace(ALICE, 'capped'))).toEqual(['personal'])
  })

  it('re-routes live rooms when the policy changes (manifest as data)', () => {
    const ns = spaceNamespace(ALICE, 'movable')
    const { manager, personal, community } = setup() // no policy → full mirror

    const handle = manager.joinScopedRoom('doc-42', ns, () => {})
    expect(handle.hubIds.slice().sort()).toEqual(['community', 'personal'])
    expect(community.isJoined('xnet-doc-doc-42')).toBe(true)

    // Editing the manifest to route this Space to `personal` only should drop
    // the community subscription for the already-joined room.
    manager.setReplication({
      federation: {
        hubs: [
          { id: 'personal', url: 'wss://personal.example' },
          { id: 'community', url: 'wss://community.example' }
        ],
        namespacePolicies: [{ namespace: ns, includeHubIds: ['personal'] }]
      }
    })

    expect(personal.isJoined('xnet-doc-doc-42')).toBe(true)
    expect(community.isJoined('xnet-doc-doc-42')).toBe(false)
    expect(handle.hubIds).toEqual(['personal'])

    // And relaxing the policy back re-subscribes community.
    manager.setReplication(undefined)
    expect(community.isJoined('xnet-doc-doc-42')).toBe(true)
  })

  it('skips policy hubs it has no transport for', () => {
    const replication: SyncReplicationConfig = {
      federation: {
        hubs: [{ id: 'ghost', url: 'wss://ghost.example' }],
        namespacePolicies: [
          {
            namespace: spaceNamespace(ALICE, 'orphan'),
            includeHubIds: ['ghost', 'personal']
          }
        ]
      }
    }
    const { manager } = setup(replication)
    const ns = spaceNamespace(ALICE, 'orphan')
    // The plan references `ghost`, but only `personal` is reachable.
    expect(manager.planFor(ns).destinations.map((destination) => destination.hubId)).toContain(
      'ghost'
    )
    expect(manager.destinationsFor(ns)).toEqual(['personal'])
  })

  it('exposes planned hubs with their trust class', () => {
    const { manager } = setup()
    const planned = manager.plannedHubs(spaceNamespace(ALICE, 'any'))
    expect(planned.find((hub) => hub.hubId === 'community')?.trust).toBe('zero-knowledge')
    expect(planned.find((hub) => hub.hubId === 'personal')?.trust).toBe('trusted')
  })

  it('fans connect/disconnect out to every hub transport', () => {
    const { manager, personal, community } = setup()
    manager.connect()
    expect(personal.connected).toBe(true)
    expect(community.connected).toBe(true)
    manager.disconnect()
    expect(personal.connected).toBe(false)
    expect(community.connected).toBe(false)
  })
})

describe('0258 trust gate (0383 W4)', () => {
  it('withholds plaintext from zero-knowledge destinations, delivers ciphertext', () => {
    const sent: Array<{ hub: string; room: string }> = []
    const transport = (hub: string) => ({
      connect: () => {},
      disconnect: () => {},
      joinRoom: () => () => {},
      publish: (room: string) => {
        sent.push({ hub, room })
      }
    })
    const manager = createMultiHubSyncManager({
      hubs: [
        {
          hubId: 'trusted-hub',
          url: 'ws://a',
          transport: transport('trusted-hub'),
          trust: 'trusted'
        },
        { hubId: 'zk-hub', url: 'ws://b', transport: transport('zk-hub'), trust: 'zero-knowledge' },
        { hubId: 'legacy-hub', url: 'ws://c', transport: transport('legacy-hub') }
      ]
    })
    const ns = 'xnet://did:key:owner/space/s1/'

    const plain = manager.publishScoped(ns, 'room-1', { type: 'sync-update' })
    expect(plain.withheld).toEqual(['zk-hub'])
    expect(plain.published.sort()).toEqual(['legacy-hub', 'trusted-hub'])
    expect(sent.filter((s) => s.hub === 'zk-hub')).toHaveLength(0)

    const cipher = manager.publishScoped(
      ns,
      'room-1',
      { type: 'sync-update', sealed: true },
      { payload: 'ciphertext' }
    )
    expect(cipher.withheld).toEqual([])
    expect(cipher.published).toContain('zk-hub')
  })
})
