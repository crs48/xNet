import { describe, expect, it } from 'vitest'
import {
  classifyWithLocalAdapters,
  createKeywordLocalClassifier,
  createLocalClassificationResult,
  mergeLocalClassificationResults,
  type LocalClassifierAdapter
} from '../src/local-classifier'

describe('local classifier adapters', () => {
  it('classifies matching keyword rules as local abuse labels', async () => {
    const adapter = createKeywordLocalClassifier({
      sourceDid: 'did:key:local-labeler',
      rules: [{ label: 'spam', keywords: ['free tokens'], confidence: 0.8, sourceWeight: 2 }]
    })

    const result = await classifyWithLocalAdapters(
      {
        surface: 'commentThread',
        subjectId: 'comment-1',
        body: 'Claim your FREE tokens today.'
      },
      [adapter]
    )

    expect(result.labels).toHaveLength(1)
    expect(result.labels[0]).toMatchObject({
      value: 'spam',
      confidence: 0.8,
      sourceDID: 'did:key:local-labeler',
      sourceWeight: 2,
      evidenceRefs: ['keyword:free tokens']
    })
    expect(result.signals[0]?.provenance).toMatchObject({
      provider: 'local',
      adapterId: 'local.keyword'
    })
  })

  it('skips unsupported adapters and bounds input before classification', async () => {
    const unsupported: LocalClassifierAdapter = {
      id: 'unsupported',
      version: '1',
      supports: () => false,
      classify: () =>
        createLocalClassificationResult({
          provenance: { provider: 'local', adapterId: 'unsupported', adapterVersion: '1' },
          labels: [{ value: 'spam', confidence: 1, sourceWeight: 1 }]
        })
    }
    const bounded: LocalClassifierAdapter = {
      id: 'bounded',
      version: '1',
      classify: (input) =>
        createLocalClassificationResult({
          provenance: { provider: 'local', adapterId: 'bounded', adapterVersion: '1' },
          labels: input.body.includes('tail')
            ? [{ value: 'tail-hit', confidence: 1, sourceWeight: 1 }]
            : []
        })
    }

    const result = await classifyWithLocalAdapters(
      { surface: 'feed', body: 'safe prefix tail' },
      [unsupported, bounded],
      { maxInputChars: 11 }
    )

    expect(result.labels).toHaveLength(0)
    expect(result.errors).toEqual([])
  })

  it('merges labels and quality signals from multiple local adapters', () => {
    const result = mergeLocalClassificationResults([
      createLocalClassificationResult({
        provenance: { provider: 'local', adapterId: 'a', adapterVersion: '1' },
        labels: [{ value: 'slop', confidence: 0.5, sourceWeight: 1, evidenceRefs: ['a'] }],
        quality: { slopScore: 0.4, provenanceScore: 0.9 }
      }),
      createLocalClassificationResult({
        provenance: { provider: 'local', adapterId: 'b', adapterVersion: '1' },
        labels: [{ value: 'slop', confidence: 0.8, sourceWeight: 1, evidenceRefs: ['b'] }],
        quality: { slopScore: 0.7, provenanceScore: 0.6 }
      })
    ])

    expect(result.labels).toEqual([
      {
        value: 'slop',
        confidence: 0.8,
        sourceWeight: 1,
        expiresAt: undefined,
        evidenceRefs: ['a', 'b']
      }
    ])
    expect(result.quality).toEqual({
      duplicateScore: undefined,
      slopScore: 0.7,
      citationCoverage: undefined,
      provenanceScore: 0.6
    })
  })
})
