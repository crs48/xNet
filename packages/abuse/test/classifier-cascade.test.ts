import { describe, expect, it, vi } from 'vitest'
import {
  classifyWithModerationCascade,
  createCloudClassifierAdapter,
  createKeywordLocalClassifier,
  type CloudClassifierAdapter
} from '../src'

describe('moderation classifier cascade', () => {
  const cloudAdapter = (overrides: Partial<CloudClassifierAdapter> = {}): CloudClassifierAdapter =>
    createCloudClassifierAdapter({
      id: 'cloud.review',
      version: '1',
      provider: 'example-ai',
      model: 'safety-small',
      defaultEstimatedCostMicroUsd: 50,
      classify: () => ({
        labels: [{ value: 'slop', confidence: 0.8, sourceWeight: 1 }]
      }),
      ...overrides
    })

  it('keeps deterministic local labels when cloud AI is unavailable', async () => {
    const classify = vi.fn(() => {
      throw new Error('provider unavailable')
    })
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
          adapter: cloudAdapter({ classify }),
          privacy: { mode: 'metadata-only' },
          budget: { remainingMicroUsd: 500, maxPerRequestMicroUsd: 100 },
          callPolicy: { minLocalLabelConfidence: 0.5 }
        }
      }
    )

    expect(classify).toHaveBeenCalledTimes(1)
    expect(result.cloudCalled).toBe(true)
    expect(result.cloudSkippedReason).toBeNull()
    expect(result.errors).toEqual(['provider unavailable'])
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

  it('skips cloud AI review for low-risk local results', async () => {
    const classify = vi.fn()
    const localGate = createKeywordLocalClassifier({
      rules: [{ label: 'spam', keywords: ['free tokens'], confidence: 0.92 }]
    })

    const result = await classifyWithModerationCascade(
      {
        surface: 'commentThread',
        subjectId: 'comment-2',
        body: 'Ordinary project update.'
      },
      {
        localAdapters: [localGate],
        cloud: {
          adapter: cloudAdapter({ classify }),
          privacy: { mode: 'redacted-content' },
          budget: { remainingMicroUsd: 500, maxPerRequestMicroUsd: 100 },
          callPolicy: {
            minLocalLabelConfidence: 0.5,
            minLocalQualityRisk: 0.5
          }
        }
      }
    )

    expect(classify).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      labels: [],
      cloudCalled: false,
      cloudSkippedReason: 'low-risk-local-signals',
      errors: []
    })
  })
})
