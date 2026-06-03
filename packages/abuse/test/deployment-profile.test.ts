import { generateIdentity } from '@xnetjs/identity'
import { describe, expect, it, vi } from 'vitest'
import {
  classifyWithModerationCascade,
  createCloudClassifierAdapter,
  createHubPolicyServiceOffer,
  createKeywordLocalClassifier,
  createPublicSearchHubAbuseProfile,
  createSmallSelfHostedAbuseProfile,
  evaluatePublicWriteBudget,
  evaluateQueryCostBudget,
  signHubPolicyServiceOffer,
  type PublicWriteBudgetUsage,
  type QueryCostBudgetUsage,
  verifySignedHubPolicyServiceOffer
} from '../src'

describe('abuse deployment profiles', () => {
  it('runs a small self-hosted profile with cloud AI disabled and local gates enabled', async () => {
    const profile = createSmallSelfHostedAbuseProfile({ hubId: 'hub.local' })
    const classify = vi.fn(() => ({
      labels: [{ value: 'spam', confidence: 1, sourceWeight: 1 }]
    }))
    const localGate = createKeywordLocalClassifier({
      sourceDid: 'did:key:local-labeler',
      rules: [{ label: 'spam', keywords: ['free tokens'], confidence: 0.92, sourceWeight: 2 }]
    })

    const result = await classifyWithModerationCascade(
      {
        surface: 'commentThread',
        subjectId: 'comment-1',
        body: 'Claim FREE tokens now.'
      },
      {
        localAdapters: [localGate],
        cloud: {
          adapter: createCloudClassifierAdapter({
            id: 'cloud.review',
            version: '1',
            provider: 'example-ai',
            model: 'safety-small',
            defaultEstimatedCostMicroUsd: 50,
            classify
          }),
          privacy: { mode: 'metadata-only' },
          budget: { remainingMicroUsd: 500, maxPerRequestMicroUsd: 100 },
          callPolicy: profile.cloudReview
        }
      }
    )

    expect(profile.moderation.aiReview.cloudModelsEnabled).toBe(false)
    expect(profile.moderation.aiReview.rawContentToCloudAllowed).toBe(false)
    expect(classify).not.toHaveBeenCalled()
    expect(result.cloudCalled).toBe(false)
    expect(result.cloudSkippedReason).toBe('cloud-disabled')
    expect(result.labels).toEqual([
      {
        value: 'spam',
        confidence: 0.92,
        sourceDID: 'did:key:local-labeler',
        sourceWeight: 2,
        expiresAt: undefined,
        evidenceRefs: ['keyword:free tokens']
      }
    ])
  })

  it('blocks common write and crawler floods with deterministic budgets', () => {
    const profile = createSmallSelfHostedAbuseProfile({ hubId: 'hub.local', windowMs: 60_000 })
    const didSurfaceLimit = profile.publicWriteBudget.limits.find(
      (limit) => limit.scope === 'did-surface'
    )
    const domainWorkLimit = profile.queryCostBudget.limits.find(
      (limit) => limit.scope === 'domain-work-type'
    )
    const writeUsage: PublicWriteBudgetUsage[] = [
      {
        key: 'did:did:key:spammer:surface:commentThread',
        scope: 'did-surface',
        usedUnits: didSurfaceLimit?.unitsPerWindow ?? 0,
        resetAt: 61_000
      }
    ]
    const crawlUsage: QueryCostBudgetUsage[] = [
      {
        key: 'domain:example.com:work-type:crawl',
        scope: 'domain-work-type',
        usedUnits: domainWorkLimit?.unitsPerWindow ?? 0,
        resetAt: 61_000
      }
    ]

    const writeDecision = evaluatePublicWriteBudget(
      {
        did: 'did:key:spammer',
        hubId: 'hub.local',
        workspaceId: 'workspace.local',
        surface: 'commentThread',
        now: 1_000
      },
      profile.publicWriteBudget,
      writeUsage
    )
    const crawlDecision = evaluateQueryCostBudget(
      {
        workType: 'crawl',
        hubId: 'hub.local',
        domain: 'example.com',
        route: '/crawl',
        now: 1_000
      },
      profile.queryCostBudget,
      crawlUsage
    )

    expect(writeDecision.allowed).toBe(false)
    expect(writeDecision.resource).toBe('require-budget')
    expect(writeDecision.reasons).toContain('budget:did-surface:exceeded')
    expect(crawlDecision.allowed).toBe(false)
    expect(crawlDecision.resource).toBe('require-budget')
    expect(crawlDecision.reasons).toContain('budget:domain-work-type:exceeded')
  })

  it('publishes crawl, index, and review budgets for public search hubs', () => {
    const hub = generateIdentity()
    const profile = createPublicSearchHubAbuseProfile({
      hubId: 'hub.search',
      windowMs: 3_600_000,
      cloudReviewDailyMicroUsd: 123_000,
      moderationReviewUnitsPerWindow: 7,
      searchIndexUnitsPerWindow: 42
    })
    const offer = createHubPolicyServiceOffer({
      id: 'public-search-policy',
      hubDID: hub.identity.did,
      issuerDID: hub.identity.did,
      title: profile.title,
      createdAt: 1_000,
      expiresAt: 90_000,
      moderation: profile.moderation,
      services: [
        {
          service: 'crawl',
          enabled: true,
          authenticated: true,
          settlement: 'reciprocal',
          reciprocalCreditRatio: 1
        },
        {
          service: 'search-index',
          enabled: true,
          authenticated: true,
          settlement: 'sponsored',
          sponsoredBy: 'hub-operator'
        },
        {
          service: 'ai-review',
          enabled: true,
          authenticated: true,
          settlement: 'paid',
          costMicroUsdPerUnit: 25
        }
      ],
      budgetHints: profile.budgetHints,
      policyRefs: [profile.id]
    })
    const signed = signHubPolicyServiceOffer(offer, hub.privateKey)
    const budgetWorkTypes = new Set(signed.budgetHints.map((hint) => hint.workType))

    expect(verifySignedHubPolicyServiceOffer(signed, 2_000)).toEqual({ valid: true, errors: [] })
    expect(budgetWorkTypes).toEqual(
      new Set([
        'public-write',
        'crawl',
        'federation-query',
        'search-index',
        'moderation-review',
        'cloud-review'
      ])
    )
    expect(signed.moderation.aiReview.maxCloudReviewMicroUsdPerDay).toBe(123_000)
    expect(
      signed.budgetHints.find((hint) => hint.name === 'public-search:search-index:domain')
    ).toMatchObject({ workType: 'search-index', scope: 'domain', unitsPerWindow: 42 })
    expect(
      signed.budgetHints.find((hint) => hint.name === 'public-search:moderation-review:safety')
    ).toMatchObject({
      workType: 'moderation-review',
      scope: 'review-queue:safety',
      unitsPerWindow: 7
    })
    expect(
      signed.budgetHints.find((hint) => hint.name === 'public-search:cloud-review:daily')
    ).toMatchObject({ workType: 'cloud-review', scope: 'hub', unitsPerWindow: 123_000 })
  })
})
