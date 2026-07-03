import { planReplicationDestinations } from '@xnetjs/sync'
import { describe, expect, it } from 'vitest'
import {
  namespaceForNode,
  replicationConfigFromPolicies,
  spaceNamespace,
  systemNamespace,
  type SpaceReplicationPolicy
} from './replication-scope'

const ALICE = 'did:key:zAlice'

describe('replication-scope namespaces', () => {
  it('scopes a Space namespace by owner and space id', () => {
    expect(spaceNamespace(ALICE, 'space-1')).toBe('xnet://did:key:zAlice/space/space-1/')
  })

  it('classifies the system namespace as system (sys/ segment)', () => {
    const ns = systemNamespace(ALICE)
    expect(ns).toBe('xnet://did:key:zAlice/sys/')
    // The planner infers `system` from the `sys/` segment.
    expect(planReplicationDestinations({ namespace: ns }).kind).toBe('system')
  })

  it('classifies a Space namespace as user', () => {
    const plan = planReplicationDestinations({ namespace: spaceNamespace(ALICE, 's') })
    expect(plan.kind).toBe('user')
  })

  it('maps a node to its Space namespace, falling back to a self-scope', () => {
    expect(namespaceForNode({ id: 'n1', space: 'space-9', createdBy: ALICE })).toBe(
      'xnet://did:key:zAlice/space/space-9/'
    )
    // No space → self-scoped under the owner.
    expect(namespaceForNode({ id: 'n2', createdBy: ALICE })).toBe('xnet://did:key:zAlice/space/n2/')
    // No author → explicit fallback owner is used.
    expect(namespaceForNode({ id: 'n3', space: 's' }, ALICE)).toBe('xnet://did:key:zAlice/space/s/')
  })
})

describe('replicationConfigFromPolicies (manifest as data)', () => {
  const policies: SpaceReplicationPolicy[] = [
    {
      space: 'family',
      ownerDID: ALICE,
      destinations: [
        { hubId: 'personal', url: 'wss://personal.example', priority: 1 },
        { hubId: 'backup', url: 'wss://backup.example', priority: 2, minReplicas: 2 }
      ]
    },
    {
      space: 'notes',
      ownerDID: ALICE,
      destinations: [{ hubId: 'personal', url: 'wss://personal.example' }]
    }
  ]

  it('collects a deduped hub inventory across policies', () => {
    const config = replicationConfigFromPolicies(policies)
    const ids = (config.federation?.hubs ?? []).map((hub) => hub.id).sort()
    // `personal` appears in both policies but is listed once.
    expect(ids).toEqual(['backup', 'personal'])
  })

  it('emits a namespace policy per Space with its destination hubs', () => {
    const config = replicationConfigFromPolicies(policies)
    const familyPolicy = config.federation?.namespacePolicies?.find(
      (policy) => policy.namespace === spaceNamespace(ALICE, 'family')
    )
    expect(familyPolicy?.includeHubIds).toEqual(['personal', 'backup'])
    // minReplicas: 2 on a destination lifts minHubs to 2.
    expect(familyPolicy?.minHubs).toBe(2)
  })

  it('routes each Space to exactly the hubs its manifest names', () => {
    const config = replicationConfigFromPolicies(policies)

    const family = planReplicationDestinations({
      namespace: spaceNamespace(ALICE, 'family'),
      config
    })
    expect(family.destinations.map((destination) => destination.hubId).sort()).toEqual([
      'backup',
      'personal'
    ])

    const notes = planReplicationDestinations({
      namespace: spaceNamespace(ALICE, 'notes'),
      config
    })
    // `notes` is manifested to `personal` only — `backup` must not appear.
    expect(notes.destinations.map((destination) => destination.hubId)).toEqual(['personal'])
  })
})
