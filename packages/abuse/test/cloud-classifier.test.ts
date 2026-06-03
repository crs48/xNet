import { describe, expect, it, vi } from 'vitest'
import {
  classifyWithCloudAdapter,
  createCloudClassifierAdapter,
  createCloudClassifierRequestBase,
  getCloudClassificationSkipReason,
  redactCloudClassifierText,
  type CloudClassifierAdapter
} from '../src/cloud-classifier'

describe('cloud classifier adapters', () => {
  const baseAdapter = (overrides: Partial<CloudClassifierAdapter> = {}): CloudClassifierAdapter =>
    createCloudClassifierAdapter({
      id: 'cloud.review',
      version: '1',
      provider: 'example-ai',
      model: 'safety-small',
      policyId: 'hub-policy',
      defaultEstimatedCostMicroUsd: 100,
      classify: () => ({
        labels: [
          {
            value: 'spam',
            confidence: 0.82,
            sourceWeight: 1,
            evidenceRefs: ['provider:spam']
          }
        ],
        quality: { slopScore: 0.7 },
        signals: [
          {
            kind: 'label',
            value: 'spam',
            confidence: 0.82,
            evidenceRefs: ['provider:spam']
          }
        ],
        chargedCostMicroUsd: 75
      }),
      ...overrides
    })

  it('skips disabled cloud review without calling the provider', async () => {
    const classify = vi.fn()
    const result = await classifyWithCloudAdapter(
      { surface: 'commentThread', body: 'Review this comment.' },
      baseAdapter({ classify }),
      { mode: 'disabled' },
      { remainingMicroUsd: 1_000, maxPerRequestMicroUsd: 200 }
    )

    expect(result.skipped).toBe('cloud-disabled')
    expect(result.usage).toMatchObject({
      chargedCostMicroUsd: 0,
      remainingBudgetMicroUsd: 1_000,
      privacyMode: 'disabled'
    })
    expect(classify).not.toHaveBeenCalled()
  })

  it('redacts content and charges only the provider-reported cost', async () => {
    const requests: string[] = []
    const adapter = baseAdapter({
      estimateCostMicroUsd: (request) => (request.body?.length ?? 0) * 2,
      classify: (request) => {
        requests.push(request.body ?? '')
        return {
          labels: [{ value: 'slop', confidence: 0.9, sourceWeight: 2 }],
          signals: [{ kind: 'label', value: 'slop', confidence: 0.9 }],
          chargedCostMicroUsd: 44
        }
      }
    })

    const result = await classifyWithCloudAdapter(
      {
        surface: 'crawl',
        subjectId: 'node-1',
        body: 'Contact jane@example.com at https://example.test before publishing.'
      },
      adapter,
      {
        mode: 'redacted-content',
        allowedProviders: ['example-ai'],
        allowedSurfaces: ['crawl'],
        sendSubjectId: false,
        maxInputChars: 120
      },
      { remainingMicroUsd: 500, maxPerRequestMicroUsd: 200 }
    )

    expect(requests).toEqual(['Contact [redacted] at [redacted] before publishing.'])
    expect(result.skipped).toBeNull()
    expect(result.usage).toMatchObject({
      estimatedCostMicroUsd: 102,
      chargedCostMicroUsd: 44,
      remainingBudgetMicroUsd: 456,
      privacyMode: 'redacted-content',
      sentBodyChars: 51
    })
    expect(result.signals[0]?.provenance).toMatchObject({
      provider: 'cloud',
      cloudProvider: 'example-ai',
      adapterId: 'cloud.review',
      adapterVersion: '1',
      model: 'safety-small',
      policyId: 'hub-policy',
      privacyMode: 'redacted-content'
    })
  })

  it('requires explicit approval before sending raw content', () => {
    const skipReason = getCloudClassificationSkipReason(
      { surface: 'feed', body: 'Raw text.' },
      baseAdapter(),
      { mode: 'raw-content' },
      { remainingMicroUsd: 500, maxPerRequestMicroUsd: 200 }
    )

    expect(skipReason).toBe('privacy-policy-blocked')
  })

  it('skips provider calls that exceed request or remaining budget', async () => {
    const classify = vi.fn()
    const result = await classifyWithCloudAdapter(
      { surface: 'feed', body: 'Needs review.' },
      baseAdapter({ classify, defaultEstimatedCostMicroUsd: 300 }),
      { mode: 'metadata-only', allowedProviders: ['example-ai'] },
      { remainingMicroUsd: 250, maxPerRequestMicroUsd: 200 }
    )

    expect(result.skipped).toBe('over-budget')
    expect(result.usage).toMatchObject({
      estimatedCostMicroUsd: 300,
      chargedCostMicroUsd: 0,
      remainingBudgetMicroUsd: 250,
      privacyMode: 'metadata-only',
      sentBodyChars: 0
    })
    expect(classify).not.toHaveBeenCalled()
  })

  it('constructs metadata-only requests without content payloads', () => {
    const request = createCloudClassifierRequestBase(
      {
        surface: 'searchIndex',
        subjectId: 'node-2',
        title: 'Visible title',
        body: 'Private body',
        metadata: { host: 'example.test' }
      },
      baseAdapter(),
      { mode: 'metadata-only', sendSubjectId: true, sendMetadata: true }
    )

    expect(request).toMatchObject({
      subjectId: 'node-2',
      metadata: { host: 'example.test' },
      privacyMode: 'metadata-only'
    })
    expect(request.title).toBeUndefined()
    expect(request.body).toBeUndefined()
  })

  it('redacts common email, phone, and URL patterns', () => {
    expect(redactCloudClassifierText('me@example.com +1 415 555 0101 https://example.test/a')).toBe(
      '[redacted] [redacted] [redacted]'
    )
  })
})
