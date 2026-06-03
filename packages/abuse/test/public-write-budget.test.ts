import { describe, expect, it } from 'vitest'
import {
  createPublicWriteBudgetKey,
  evaluatePublicWriteBudget,
  type PublicWriteBudgetPolicy,
  type PublicWriteBudgetUsage
} from '../src/public-write-budget'

describe('public write budgets', () => {
  const policy: PublicWriteBudgetPolicy = {
    defaultCostUnits: 1,
    limits: [
      { scope: 'did', unitsPerWindow: 3, windowMs: 60_000 },
      { scope: 'hub', unitsPerWindow: 100, windowMs: 60_000 },
      { scope: 'workspace', unitsPerWindow: 20, windowMs: 60_000 },
      { scope: 'surface', unitsPerWindow: 10, windowMs: 60_000 },
      { scope: 'did-surface', unitsPerWindow: 2, windowMs: 60_000 }
    ]
  }

  it('charges public writes across DID, hub, workspace, and surface scopes', () => {
    const decision = evaluatePublicWriteBudget(
      {
        did: 'did:key:alice',
        hubId: 'hub-1',
        workspaceId: 'workspace-1',
        surface: 'commentThread',
        now: 1_000
      },
      policy
    )

    expect(decision.allowed).toBe(true)
    expect(decision.resource).toBe('normal')
    expect(decision.reasons).toEqual(['budget:accepted'])
    expect(decision.nextUsage.map((entry) => entry.key)).toEqual([
      'did:did:key:alice',
      'did:did:key:alice:surface:commentThread',
      'hub:hub-1',
      'surface:commentThread',
      'workspace:workspace-1'
    ])
    expect(decision.nextUsage.every((entry) => entry.usedUnits === 1)).toBe(true)
  })

  it('rejects writes that would exceed the DID budget', () => {
    const usage: PublicWriteBudgetUsage[] = [
      {
        key: 'did:did:key:alice',
        scope: 'did',
        usedUnits: 3,
        resetAt: 61_000
      }
    ]

    const decision = evaluatePublicWriteBudget(
      { did: 'did:key:alice', surface: 'feed', now: 2_000 },
      policy,
      usage
    )

    expect(decision.allowed).toBe(false)
    expect(decision.resource).toBe('require-budget')
    expect(decision.reasons).toEqual(['budget:did:exceeded'])
    expect(decision.nextUsage).toEqual(usage)
  })

  it('drops expired usage windows before charging', () => {
    const decision = evaluatePublicWriteBudget(
      { did: 'did:key:alice', surface: 'feed', now: 70_000 },
      policy,
      [
        {
          key: 'did:did:key:alice',
          scope: 'did',
          usedUnits: 3,
          resetAt: 61_000
        }
      ]
    )

    expect(decision.allowed).toBe(true)
    expect(decision.nextUsage.find((entry) => entry.scope === 'did')).toMatchObject({
      usedUnits: 1,
      resetAt: 130_000
    })
  })

  it('keeps DID surface budgets isolated by surface', () => {
    const usage: PublicWriteBudgetUsage[] = [
      {
        key: 'did:did:key:alice:surface:commentThread',
        scope: 'did-surface',
        usedUnits: 2,
        resetAt: 61_000
      }
    ]

    const feedDecision = evaluatePublicWriteBudget(
      { did: 'did:key:alice', surface: 'feed', now: 2_000 },
      policy,
      usage
    )
    const commentDecision = evaluatePublicWriteBudget(
      { did: 'did:key:alice', surface: 'commentThread', now: 2_000 },
      policy,
      usage
    )

    expect(feedDecision.allowed).toBe(true)
    expect(commentDecision.allowed).toBe(false)
    expect(commentDecision.reasons).toEqual(['budget:did-surface:exceeded'])
  })

  it('skips scoped limits when the identifier is unavailable', () => {
    const decision = evaluatePublicWriteBudget(
      { surface: 'messageInbox', now: 1_000 },
      {
        limits: [
          { scope: 'did', unitsPerWindow: 1, windowMs: 60_000 },
          { scope: 'surface', unitsPerWindow: 1, windowMs: 60_000 }
        ]
      }
    )

    expect(decision.nextUsage).toEqual([
      {
        key: 'surface:messageInbox',
        scope: 'surface',
        usedUnits: 1,
        resetAt: 61_000
      }
    ])
  })

  it('creates stable budget keys', () => {
    expect(
      createPublicWriteBudgetKey(
        {
          did: 'did:key:alice',
          workspaceId: 'workspace-1',
          hubId: 'hub-1',
          surface: 'searchIndex'
        },
        'workspace-surface'
      )
    ).toBe('workspace:workspace-1:surface:searchIndex')
  })
})
