import { describe, expect, it } from 'vitest'
import { decidePublicInteraction, decideRemoteMutation, decideTransport } from '../src/decision'
import {
  createAbuseUsageEvent,
  createAbuseUsageEventsFromDecision,
  summarizeAbuseUsageEvents,
  type AbuseUsageEventInput
} from '../src/usage-events'

describe('abuse usage events', () => {
  it('creates content-free blocked events with hashed identities', () => {
    const input = {
      kind: 'blocked',
      surface: 'remoteMutation',
      workType: 'remote-mutation',
      actorDID: 'did:key:alice',
      remotePeerId: 'peer-a',
      units: 2,
      reasonCodes: ['invalid-signature'],
      resource: 'block-peer',
      occurredAt: 1_000,
      content: 'raw user content should never be copied'
    } satisfies AbuseUsageEventInput & { content: string }

    const event = createAbuseUsageEvent(input)
    const serialized = JSON.stringify(event)

    expect(event.kind).toBe('blocked')
    expect(event.settlement).toBe('abuse-blocked')
    expect(event.actorHash).toMatch(/^p_/)
    expect(event.remotePeerHash).toMatch(/^p_/)
    expect(serialized).not.toContain('did:key:alice')
    expect(serialized).not.toContain('peer-a')
    expect(serialized).not.toContain('raw user content')
    expect(Object.keys(event)).not.toContain('content')
  })

  it('summarizes free, paid, sponsored, reciprocal, and abuse-blocked work', () => {
    const events = [
      createAbuseUsageEvent({
        kind: 'billable',
        surface: 'searchIndex',
        workType: 'federation-query',
        actorDID: 'did:key:alice',
        costMicroUsd: 120,
        units: 3,
        occurredAt: 1_000
      }),
      createAbuseUsageEvent({
        kind: 'sponsored',
        surface: 'crawl',
        workType: 'crawl',
        actorDID: 'did:key:bob',
        costMicroUsd: 90,
        sponsoredMicroUsd: 90,
        units: 2,
        occurredAt: 1_001
      }),
      createAbuseUsageEvent({
        kind: 'reciprocal',
        surface: 'searchIndex',
        workType: 'federation-query',
        actorDID: 'did:key:carol',
        reciprocalCreditUnits: 4,
        units: 4,
        occurredAt: 1_002
      }),
      createAbuseUsageEvent({
        kind: 'blocked',
        surface: 'remoteMutation',
        workType: 'remote-mutation',
        actorDID: 'did:key:mallory',
        units: 5,
        occurredAt: 1_003
      }),
      createAbuseUsageEvent({
        kind: 'reviewed',
        surface: 'commentThread',
        workType: 'public-write',
        actorDID: 'did:key:dana',
        units: 1,
        occurredAt: 1_004
      })
    ]

    const summary = summarizeAbuseUsageEvents(events)

    expect(summary.totalEvents).toBe(5)
    expect(summary.kindCounts).toMatchObject({
      billable: 1,
      sponsored: 1,
      reciprocal: 1,
      blocked: 1,
      reviewed: 1
    })
    expect(summary.settlementCounts).toMatchObject({
      paid: 1,
      sponsored: 1,
      reciprocal: 1,
      'abuse-blocked': 1,
      free: 1
    })
    expect(summary.costMicroUsd).toBe(210)
    expect(summary.billableMicroUsd).toBe(120)
    expect(summary.sponsoredMicroUsd).toBe(90)
    expect(summary.reciprocalCreditUnits).toBe(4)
    expect(summary.blockedUnits).toBe(5)
    expect(summary.reviewedUnits).toBe(1)
    expect(summary.eventsByWorkType['federation-query']).toBe(2)
  })

  it('derives blocked and throttled usage from abuse decisions', () => {
    const blockedDecision = decideRemoteMutation({
      actor: { peerScore: 5 },
      now: 1_000
    })
    const throttledDecision = decideTransport({
      resource: { overRateLimit: true },
      now: 1_000
    })

    const blockedEvents = createAbuseUsageEventsFromDecision({
      decision: blockedDecision,
      surface: 'remoteMutation',
      workType: 'remote-mutation',
      actorDID: 'did:key:blocked',
      costMicroUsd: 50,
      occurredAt: 1_000
    })
    const throttledEvents = createAbuseUsageEventsFromDecision({
      decision: throttledDecision,
      surface: 'transport',
      workType: 'remote-mutation',
      actorDID: 'did:key:throttled',
      occurredAt: 1_001
    })

    expect(blockedEvents.map((event) => event.kind)).toEqual(['blocked'])
    expect(blockedEvents[0]?.billableMicroUsd).toBe(0)
    expect(blockedEvents[0]?.reasonCodes).toEqual(['peer-score-block'])
    expect(throttledEvents.map((event) => event.kind)).toEqual(['throttled'])
    expect(throttledEvents[0]?.resource).toBe('throttle')
  })

  it('derives review and economic usage from accepted decisions', () => {
    const reviewedDecision = decidePublicInteraction({
      actor: { firstContact: true },
      surface: 'commentThread',
      now: 1_000
    })
    const acceptedDecision = decideTransport({ now: 1_000 })

    const reviewedEvents = createAbuseUsageEventsFromDecision({
      decision: reviewedDecision,
      surface: 'commentThread',
      workType: 'public-write',
      actorDID: 'did:key:first-contact',
      costMicroUsd: 35,
      occurredAt: 1_000
    })
    const sponsoredEvents = createAbuseUsageEventsFromDecision({
      decision: acceptedDecision,
      surface: 'crawl',
      workType: 'crawl',
      actorDID: 'did:key:sponsor',
      costMicroUsd: 80,
      sponsoredMicroUsd: 80,
      occurredAt: 1_001
    })

    expect(reviewedEvents.map((event) => event.kind)).toEqual(['reviewed'])
    expect(reviewedEvents[0]?.reviewQueue).toBe('safety')
    expect(reviewedEvents[0]?.billableMicroUsd).toBe(0)
    expect(sponsoredEvents.map((event) => event.kind)).toEqual(['sponsored'])
    expect(sponsoredEvents[0]?.settlement).toBe('sponsored')
  })

  it('creates stable event ids for equivalent normalized events', () => {
    const first = createAbuseUsageEvent({
      kind: 'billable',
      surface: 'searchIndex',
      workType: 'federation-query',
      actorDID: 'did:key:alice',
      domain: 'WWW.Example.com',
      route: ' Search Nodes ',
      tags: ['Operator', 'operator'],
      costMicroUsd: 10,
      occurredAt: 1_000
    })
    const second = createAbuseUsageEvent({
      kind: 'billable',
      surface: 'searchIndex',
      workType: 'federation-query',
      actorDID: 'did:key:alice',
      domain: 'example.com',
      route: 'Search Nodes',
      tags: ['operator'],
      costMicroUsd: 10,
      occurredAt: 1_000
    })

    expect(first.id).toBe(second.id)
    expect(first.domain).toBe('example.com')
    expect(first.route).toBe('search-nodes')
    expect(first.tags).toEqual(['operator'])
  })
})
