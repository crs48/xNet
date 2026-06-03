import { describe, expect, it } from 'vitest'
import { DevToolsEventBus } from '../core/event-bus'
import {
  emitAbuseLabel,
  emitAbusePeerScores,
  emitAbusePolicyDecision,
  emitAbuseQueueState,
  emitAbuseUsageSummary
} from '../instrumentation/abuse'
import { rebuildAbusePanelState, summarizeAbusePanelState } from './AbusePanel/useAbusePanel'
import { DEVTOOLS_PANELS } from './panel-registry'

describe('Abuse panel wiring', () => {
  it('registers Abuse as a top-level devtools panel', () => {
    const panelIds = DEVTOOLS_PANELS.map((panel) => panel.id)
    expect(panelIds).toContain('abuse')
  })

  it('rebuilds policy, label, peer score, and queue state from event history', () => {
    const bus = new DevToolsEventBus()

    emitAbusePolicyDecision(bus, {
      surface: 'remoteMutation',
      subjectId: 'node-1',
      peerId: 'peer-1',
      peerScore: 8,
      admission: 'reject',
      visibility: 'hide',
      reach: 'exclude',
      resource: 'block-peer',
      reasons: ['peer-score-block'],
      includeInCounters: false,
      includeInSearch: false,
      labelsToEmit: [
        {
          value: 'spam',
          confidence: 0.9,
          reason: 'peer-score-block',
          evidenceRefs: ['event-1']
        }
      ]
    })

    emitAbuseLabel(bus, {
      subjectId: 'node-1',
      value: 'spam',
      action: 'applied',
      confidence: 0.9,
      sourceDid: 'did:key:moderator',
      evidenceRefs: ['event-1']
    })

    emitAbuseQueueState(bus, {
      queues: [
        {
          queue: 'safety',
          pending: 2,
          active: 1,
          highestPriority: 80,
          sampleSubjectIds: ['node-1']
        }
      ]
    })

    emitAbusePeerScores(bus, {
      scores: [
        {
          peerId: 'peer-1',
          score: 8,
          syncSuccesses: 1,
          syncFailures: 3,
          invalidSignatures: 1,
          rateLimitViolations: 2,
          lastSeen: Date.now()
        }
      ]
    })

    emitAbuseUsageSummary(bus, {
      period: 'last-hour',
      hubId: 'hub-a',
      summary: {
        totalEvents: 5,
        totalUnits: 24,
        costMicroUsd: 780,
        billableMicroUsd: 50,
        sponsoredMicroUsd: 0,
        reciprocalCreditUnits: 0,
        blockedUnits: 10,
        throttledUnits: 4,
        reviewedUnits: 5,
        automationSavedUnits: 14,
        automationSavedCostMicroUsd: 600,
        appealUnits: 3,
        appealCostMicroUsd: 90,
        automationSavingsRatio: 14 / 24,
        reviewLoadRatio: 5 / 24,
        appealLoadRatio: 3 / 24
      }
    })

    const state = rebuildAbusePanelState(bus.getEvents())
    const summary = summarizeAbusePanelState(state)

    expect(state.decisions).toHaveLength(1)
    expect(state.decisions[0]).toMatchObject({
      surface: 'remoteMutation',
      admission: 'reject',
      resource: 'block-peer',
      reasons: ['peer-score-block']
    })
    expect(state.labels[0]).toMatchObject({ value: 'spam', action: 'applied' })
    expect(state.queues[0]).toMatchObject({ queue: 'safety', pending: 2 })
    expect(state.peerScores[0]).toMatchObject({ peerId: 'peer-1', score: 8 })
    expect(state.usageSummaries[0]).toMatchObject({
      period: 'last-hour',
      hubId: 'hub-a',
      summary: {
        automationSavedUnits: 14,
        automationSavedCostMicroUsd: 600,
        appealLoadRatio: 3 / 24
      }
    })
    expect(summary).toMatchObject({
      totalDecisions: 1,
      rejected: 1,
      counterExcluded: 1,
      searchExcluded: 1,
      labels: 1,
      pendingQueueItems: 2,
      riskyPeers: 1,
      usageSnapshots: 1,
      automationSavedUnits: 14,
      automationSavedCostMicroUsd: 600,
      appealLoadRatio: 3 / 24
    })
  })
})
