import { describe, expect, it } from 'vitest'
import { decidePublicInteraction } from '../src/decision'
import {
  createLabelerSubscription,
  createTrustedLabelFromSetting,
  evaluateReportEscalation,
  evaluateLabelerSubscriptionLimit,
  evaluateLabelerTrust,
  type LabelerTrustSetting
} from '../src/labeler-trust'

describe('labeler trust settings', () => {
  const settings: LabelerTrustSetting[] = [
    {
      scope: 'workspace',
      scopeId: 'workspace-1',
      labelerDID: 'did:key:trusted-labeler',
      level: 'trusted',
      weight: 0.8,
      minConfidence: 0.7,
      allowedLabels: ['spam', 'slop']
    },
    {
      scope: 'workspace',
      scopeId: 'workspace-1',
      labelerDID: 'did:key:blocked-labeler',
      level: 'blocked',
      weight: 0,
      minConfidence: 1
    },
    {
      scope: 'hub',
      scopeId: 'hub-1',
      labelerDID: 'did:key:review-labeler',
      level: 'review',
      weight: 0.5,
      minConfidence: 0.4,
      deniedLabels: ['malware']
    }
  ]

  it('accepts trusted labelers for allowed workspace labels', () => {
    const decision = evaluateLabelerTrust(
      {
        scope: 'workspace',
        scopeId: 'workspace-1',
        labelerDID: 'did:key:trusted-labeler',
        labelValue: 'spam',
        confidence: 0.9,
        now: 1_000
      },
      settings
    )
    const label = createTrustedLabelFromSetting(
      {
        scope: 'workspace',
        scopeId: 'workspace-1',
        labelerDID: 'did:key:trusted-labeler',
        labelValue: 'spam',
        confidence: 0.9,
        evidenceRefs: ['labeler-report:123'],
        labelExpiresAt: 90_000,
        now: 1_000
      },
      settings
    )

    expect(decision).toMatchObject({
      accepted: true,
      action: 'accept',
      reasons: ['labeler:trusted'],
      effectiveWeight: 0.8
    })
    expect(label).toEqual({
      value: 'spam',
      sourceDID: 'did:key:trusted-labeler',
      sourceWeight: 0.8,
      confidence: 0.9,
      expiresAt: 90_000,
      evidenceRefs: ['labeler-report:123']
    })
  })

  it('requires review or ignores labels outside the trust setting', () => {
    const lowConfidence = evaluateLabelerTrust(
      {
        scope: 'workspace',
        scopeId: 'workspace-1',
        labelerDID: 'did:key:trusted-labeler',
        labelValue: 'spam',
        confidence: 0.4,
        now: 1_000
      },
      settings
    )
    const notAllowed = evaluateLabelerTrust(
      {
        scope: 'workspace',
        scopeId: 'workspace-1',
        labelerDID: 'did:key:trusted-labeler',
        labelValue: 'malware',
        confidence: 0.95,
        now: 1_000
      },
      settings
    )
    const review = evaluateLabelerTrust(
      {
        scope: 'hub',
        scopeId: 'hub-1',
        labelerDID: 'did:key:review-labeler',
        labelValue: 'slop',
        confidence: 0.8,
        now: 1_000
      },
      settings
    )

    expect(lowConfidence).toMatchObject({
      accepted: false,
      action: 'review',
      reasons: ['labeler:confidence-too-low']
    })
    expect(notAllowed).toMatchObject({
      accepted: false,
      action: 'ignore',
      reasons: ['labeler:label-not-allowed']
    })
    expect(review).toMatchObject({
      accepted: false,
      action: 'review',
      reasons: ['labeler:review-required']
    })
  })

  it('rejects blocked labelers before using labels', () => {
    const decision = evaluateLabelerTrust(
      {
        scope: 'workspace',
        scopeId: 'workspace-1',
        labelerDID: 'did:key:blocked-labeler',
        labelValue: 'spam',
        confidence: 1,
        now: 1_000
      },
      settings
    )

    expect(decision).toMatchObject({
      accepted: false,
      action: 'reject',
      reasons: ['labeler:blocked'],
      effectiveWeight: 0
    })
  })

  it('prevents untrusted reports from directly hiding content', () => {
    const untrustedReport = evaluateReportEscalation(
      {
        scope: 'workspace',
        scopeId: 'workspace-1',
        reporterDID: 'did:key:untrusted-reporter',
        reportId: 'report-1',
        labelValue: 'spam',
        confidence: 1,
        evidenceRefs: ['comment:target-1'],
        now: 1_000
      },
      settings
    )
    const untrustedDecision = decidePublicInteraction({
      labels: untrustedReport.trustedLabel ? [untrustedReport.trustedLabel] : [],
      policy: {
        abuseLabelHideThreshold: 0.5,
        quarantineFirstContact: false
      }
    })

    expect(untrustedReport).toMatchObject({
      canAffectVisibility: false,
      trustedLabel: null,
      trustDecision: {
        action: 'ignore',
        reasons: ['labeler:unconfigured']
      },
      evidenceRefs: ['abuse-report:report-1', 'comment:target-1']
    })
    expect(untrustedDecision).toMatchObject({
      visibility: 'show',
      reach: 'normal',
      includeInCounters: true,
      reasons: ['accepted']
    })
  })

  it('allows trusted reporter policy to escalate reports into enforcing labels', () => {
    const escalation = evaluateReportEscalation(
      {
        scope: 'workspace',
        scopeId: 'workspace-1',
        reporterDID: 'did:key:trusted-labeler',
        reportId: 'report-2',
        labelValue: 'spam',
        confidence: 0.9,
        evidenceRefs: ['comment:target-2'],
        labelExpiresAt: 90_000,
        now: 1_000
      },
      settings
    )
    const trustedLabel = escalation.trustedLabel
    if (!trustedLabel) {
      throw new Error('expected trusted reporter escalation to create a label')
    }

    const decision = decidePublicInteraction({
      labels: [trustedLabel],
      policy: {
        abuseLabelHideThreshold: 0.5,
        quarantineFirstContact: false
      },
      now: 1_000
    })

    expect(escalation).toMatchObject({
      canAffectVisibility: true,
      trustDecision: {
        accepted: true,
        action: 'accept',
        reasons: ['labeler:trusted']
      },
      trustedLabel: {
        value: 'spam',
        sourceDID: 'did:key:trusted-labeler',
        sourceWeight: 0.8,
        confidence: 0.9,
        expiresAt: 90_000,
        evidenceRefs: ['abuse-report:report-2', 'comment:target-2']
      }
    })
    expect(decision).toMatchObject({
      visibility: 'hide',
      reach: 'exclude',
      includeInCounters: false,
      reasons: ['trusted-abuse-label']
    })
  })
})

describe('labeler subscription limits', () => {
  it('rejects subscriptions that exceed workspace and hub limits', () => {
    const subscriptions = [
      createLabelerSubscription({
        id: 'workspace-sub-1',
        labelerDID: 'did:key:labeler-a',
        workspaceId: 'workspace-1',
        hubId: 'hub-1',
        createdAt: 1_000
      }),
      createLabelerSubscription({
        id: 'workspace-sub-2',
        labelerDID: 'did:key:labeler-b',
        workspaceId: 'workspace-1',
        hubId: 'hub-1',
        createdAt: 1_000
      })
    ]

    const decision = evaluateLabelerSubscriptionLimit(
      {
        id: 'workspace-sub-3',
        labelerDID: 'did:key:labeler-c',
        workspaceId: 'workspace-1',
        hubId: 'hub-1',
        now: 2_000
      },
      {
        maxWorkspaceSubscriptions: 2,
        maxHubSubscriptions: 2
      },
      subscriptions
    )

    expect(decision.allowed).toBe(false)
    expect(decision.reasons).toEqual([
      'labeler-subscription:workspace-limit-exceeded',
      'labeler-subscription:hub-limit-exceeded'
    ])
    expect(decision.activeCounts).toMatchObject({
      workspace: 2,
      hub: 2
    })
    expect(decision.nextSubscription).toBeUndefined()
  })

  it('limits duplicate subscriptions to the same labeler per workspace or hub', () => {
    const subscriptions = [
      createLabelerSubscription({
        id: 'workspace-sub-1',
        labelerDID: 'did:key:labeler-a',
        workspaceId: 'workspace-1',
        hubId: 'hub-1',
        createdAt: 1_000
      }),
      createLabelerSubscription({
        id: 'expired-sub',
        labelerDID: 'did:key:labeler-a',
        workspaceId: 'workspace-1',
        hubId: 'hub-1',
        createdAt: 1_000,
        expiresAt: 1_500
      })
    ]

    const decision = evaluateLabelerSubscriptionLimit(
      {
        id: 'workspace-sub-2',
        labelerDID: 'did:key:labeler-a',
        workspaceId: 'workspace-1',
        hubId: 'hub-1',
        now: 2_000
      },
      {
        maxWorkspaceSubscriptionsPerLabeler: 1,
        maxHubSubscriptionsPerLabeler: 1
      },
      subscriptions
    )

    expect(decision.allowed).toBe(false)
    expect(decision.reasons).toEqual([
      'labeler-subscription:workspace-labeler-limit-exceeded',
      'labeler-subscription:hub-labeler-limit-exceeded'
    ])
    expect(decision.activeCounts.workspaceLabeler).toBe(1)
    expect(decision.activeCounts.hubLabeler).toBe(1)
  })

  it('returns the next subscription when limits allow it', () => {
    const decision = evaluateLabelerSubscriptionLimit(
      {
        id: 'workspace-sub-1',
        labelerDID: 'did:key:labeler-a',
        workspaceId: 'workspace-1',
        hubId: 'hub-1',
        now: 2_000
      },
      {
        maxWorkspaceSubscriptions: 2,
        maxHubSubscriptions: 2
      }
    )

    expect(decision).toMatchObject({
      allowed: true,
      reasons: ['labeler-subscription:accepted'],
      nextSubscription: {
        id: 'workspace-sub-1',
        labelerDID: 'did:key:labeler-a',
        workspaceId: 'workspace-1',
        hubId: 'hub-1',
        status: 'active',
        createdAt: 2_000
      }
    })
  })
})
