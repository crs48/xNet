import { describe, expect, it } from 'vitest'
import {
  inferReplicationNamespaceKind,
  normalizeSyncFederationHubs,
  planReplicationDestinations,
  resolveSyncReplicationPolicy,
  simulateSyncPolicyRevision
} from './replication-policy'

describe('resolveSyncReplicationPolicy', () => {
  it('requires signed replication by default', () => {
    expect(resolveSyncReplicationPolicy(undefined)).toEqual({
      allowUnsignedReplication: false,
      requireSignedReplication: true
    })
  })

  it('allows unsigned replication only through explicit compatibility mode', () => {
    expect(
      resolveSyncReplicationPolicy({
        compatibility: {
          allowUnsignedReplication: true
        }
      })
    ).toEqual({
      allowUnsignedReplication: true,
      requireSignedReplication: false
    })
  })
})

describe('planReplicationDestinations', () => {
  const config = {
    federation: {
      hubs: [
        { id: 'primary', url: 'wss://primary.example.net', priority: 10 },
        { id: 'system', url: 'wss://system.example.net', priority: 1, kinds: ['system'] },
        { id: 'user', url: 'wss://user.example.net', priority: 2, kinds: ['user'] }
      ],
      defaultSystemHubIds: ['system', 'primary'],
      defaultUserHubIds: ['user', 'primary'],
      namespacePolicies: [
        {
          namespace: 'xnet://did:key:zAlice/sys/schema/',
          includeHubIds: ['system', 'primary'],
          maxHubs: 1
        },
        {
          namespace: 'xnet://did:key:zAlice/private/',
          includeHubIds: ['user', 'missing'],
          excludeHubIds: ['primary'],
          minHubs: 2
        }
      ]
    }
  } as const

  it('classifies system namespaces from sys path segments', () => {
    expect(inferReplicationNamespaceKind('xnet://did:key:zAlice/sys/schema/')).toBe('system')
    expect(inferReplicationNamespaceKind('xnet://did:key:zAlice/pages/')).toBe('user')
  })

  it('normalizes configured hubs with fallback URLs and stable IDs', () => {
    expect(
      normalizeSyncFederationHubs(
        {
          federation: {
            hubs: [{ id: 'primary', url: 'wss://primary.example.net' }]
          }
        },
        ['wss://fallback.example.net']
      )
    ).toEqual([
      { id: 'primary', url: 'wss://primary.example.net', priority: 0 },
      { id: 'wss://fallback.example.net', url: 'wss://fallback.example.net', priority: 1 }
    ])
  })

  it('selects system destinations using the most specific namespace policy', () => {
    const plan = planReplicationDestinations({
      namespace: 'xnet://did:key:zAlice/sys/schema/SchemaDefinition',
      config
    })

    expect(plan.kind).toBe('system')
    expect(plan.destinations.map((destination) => destination.hubId)).toEqual(['system'])
    expect(plan.trace.map((step) => step.step)).toContain('select')
  })

  it('selects user destinations from user defaults when no policy matches', () => {
    const plan = planReplicationDestinations({
      namespace: 'xnet://did:key:zAlice/pages/',
      config
    })

    expect(plan.kind).toBe('user')
    expect(plan.destinations.map((destination) => destination.hubId)).toEqual(['user', 'primary'])
  })

  it('surfaces diagnostics for unknown policy hubs and unsatisfied minimums', () => {
    const plan = planReplicationDestinations({
      namespace: 'xnet://did:key:zAlice/private/notes',
      config
    })

    expect(plan.destinations.map((destination) => destination.hubId)).toEqual(['user'])
    expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'policy_hub_not_found',
      'minimum_hubs_not_satisfied'
    ])
  })

  it('simulates policy revisions deterministically', () => {
    const revision = {
      federation: {
        ...config.federation,
        namespacePolicies: [
          {
            namespace: 'xnet://did:key:zAlice/sys/schema/',
            includeHubIds: ['system', 'primary'],
            maxHubs: 2
          }
        ]
      }
    } as const

    const simulation = simulateSyncPolicyRevision({
      namespace: 'xnet://did:key:zAlice/sys/schema/SchemaDefinition',
      current: config,
      revision
    })

    expect(simulation.before.destinations.map((destination) => destination.hubId)).toEqual([
      'system'
    ])
    expect(simulation.after.destinations.map((destination) => destination.hubId)).toEqual([
      'system',
      'primary'
    ])
    expect(simulation.addedHubIds).toEqual(['primary'])
    expect(simulation.removedHubIds).toEqual([])
    expect(simulation.retainedHubIds).toEqual(['system'])
    expect(simulation.changed).toBe(true)
  })
})
