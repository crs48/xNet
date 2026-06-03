import { describe, expect, it } from 'vitest'
import {
  createQueryCostBudgetKey,
  evaluateQueryCostBudget,
  type QueryCostBudgetPolicy,
  type QueryCostBudgetUsage
} from '../src/query-cost-budget'

describe('query cost budgets', () => {
  const policy: QueryCostBudgetPolicy = {
    defaultCostUnits: 1,
    limits: [
      { scope: 'hub-work-type', unitsPerWindow: 100, windowMs: 60_000 },
      { scope: 'domain-work-type', unitsPerWindow: 5, windowMs: 60_000 },
      { scope: 'remote-peer-route', unitsPerWindow: 3, windowMs: 60_000 },
      { scope: 'work-type', unitsPerWindow: 200, windowMs: 60_000 }
    ]
  }

  it('charges crawl work by hub, domain, and work type', () => {
    const decision = evaluateQueryCostBudget(
      {
        workType: 'crawl',
        hubId: 'hub-1',
        domain: 'WWW.Example.com',
        route: '/crawl',
        costUnits: 2,
        now: 1_000
      },
      policy
    )

    expect(decision.allowed).toBe(true)
    expect(decision.nextUsage).toEqual([
      {
        key: 'domain:example.com:work-type:crawl',
        scope: 'domain-work-type',
        usedUnits: 2,
        resetAt: 61_000
      },
      {
        key: 'hub:hub-1:work-type:crawl',
        scope: 'hub-work-type',
        usedUnits: 2,
        resetAt: 61_000
      },
      {
        key: 'work-type:crawl',
        scope: 'work-type',
        usedUnits: 2,
        resetAt: 61_000
      }
    ])
  })

  it('rejects crawl work that exceeds a domain work budget', () => {
    const usage: QueryCostBudgetUsage[] = [
      {
        key: 'domain:example.com:work-type:crawl',
        scope: 'domain-work-type',
        usedUnits: 5,
        resetAt: 61_000
      }
    ]

    const decision = evaluateQueryCostBudget(
      { workType: 'crawl', domain: 'example.com', now: 2_000 },
      policy,
      usage
    )

    expect(decision.allowed).toBe(false)
    expect(decision.resource).toBe('require-budget')
    expect(decision.reasons).toEqual(['budget:domain-work-type:exceeded'])
    expect(decision.nextUsage).toEqual(usage)
  })

  it('tracks federation query routes per remote peer', () => {
    const first = evaluateQueryCostBudget(
      {
        workType: 'federation-query',
        remotePeerId: 'peer-a',
        route: ' Search Nodes ',
        costUnits: 3,
        now: 1_000
      },
      policy
    )
    const second = evaluateQueryCostBudget(
      {
        workType: 'federation-query',
        remotePeerId: 'peer-a',
        route: 'Search Nodes',
        now: 2_000
      },
      policy,
      first.nextUsage
    )

    expect(first.allowed).toBe(true)
    expect(first.nextUsage.find((entry) => entry.scope === 'remote-peer-route')).toMatchObject({
      key: 'remote-peer:peer-a:route:search-nodes',
      usedUnits: 3
    })
    expect(second.allowed).toBe(false)
    expect(second.reasons).toEqual(['budget:remote-peer-route:exceeded'])
  })

  it('drops expired query cost windows before charging', () => {
    const decision = evaluateQueryCostBudget(
      {
        workType: 'federation-query',
        remotePeerId: 'peer-a',
        route: 'search',
        now: 70_000
      },
      policy,
      [
        {
          key: 'remote-peer:peer-a:route:search',
          scope: 'remote-peer-route',
          usedUnits: 3,
          resetAt: 61_000
        }
      ]
    )

    expect(decision.allowed).toBe(true)
    expect(decision.nextUsage.find((entry) => entry.scope === 'remote-peer-route')).toMatchObject({
      usedUnits: 1,
      resetAt: 130_000
    })
  })

  it('skips scoped limits when identifiers are unavailable', () => {
    const decision = evaluateQueryCostBudget(
      { workType: 'crawl', now: 1_000 },
      {
        limits: [
          { scope: 'domain', unitsPerWindow: 1, windowMs: 60_000 },
          { scope: 'work-type', unitsPerWindow: 1, windowMs: 60_000 }
        ]
      }
    )

    expect(decision.nextUsage).toEqual([
      {
        key: 'work-type:crawl',
        scope: 'work-type',
        usedUnits: 1,
        resetAt: 61_000
      }
    ])
  })

  it('creates normalized query cost budget keys', () => {
    expect(
      createQueryCostBudgetKey(
        {
          workType: 'federation-query',
          remotePeerId: 'peer-a',
          route: ' Search Nodes '
        },
        'remote-peer-route'
      )
    ).toBe('remote-peer:peer-a:route:search-nodes')
  })
})
