import { describe, expect, it } from 'vitest'
import { createNsfwImageClassifier } from './local-image-classifier'
import { prescreenImage, prescreenImageLabels } from './image-prescreen'
import { buildSensitivityLabel } from './sensitivity'

function label(value: 'sexual' | 'nudity' | 'porn' | 'graphic-media', confidence: number) {
  return buildSensitivityLabel({ value, source: 'ml', confidence })
}

describe('prescreenImageLabels', () => {
  it('allows when there are no sensitivity labels', () => {
    expect(prescreenImageLabels([])).toMatchObject({
      recommendation: 'allow',
      suggestedLabel: null
    })
  })

  it('warns on confident explicit content', () => {
    const result = prescreenImageLabels([label('porn', 0.92)])
    expect(result.recommendation).toBe('warn-explicit')
    expect(result.suggestedLabel).toBe('porn')
    expect(result.confidence).toBeCloseTo(0.92)
  })

  it('suggests a self-label for non-explicit sensitivity', () => {
    const result = prescreenImageLabels([label('sexual', 0.6)])
    expect(result.recommendation).toBe('suggest-label')
    expect(result.suggestedLabel).toBe('sexual')
  })

  it('allows low-confidence detections below the suggest threshold', () => {
    expect(prescreenImageLabels([label('sexual', 0.2)]).recommendation).toBe('allow')
  })

  it('treats borderline explicit (below warn but above suggest) as suggest-label', () => {
    const result = prescreenImageLabels([label('porn', 0.5)])
    expect(result.recommendation).toBe('suggest-label')
    expect(result.suggestedLabel).toBe('porn')
  })

  it('picks the strongest sensitivity label when several are present', () => {
    const result = prescreenImageLabels([label('sexual', 0.5), label('porn', 0.95)])
    expect(result.suggestedLabel).toBe('porn')
    expect(result.recommendation).toBe('warn-explicit')
  })
})

describe('prescreenImage (with the injected classifier seam)', () => {
  it('runs the classifier and reduces it to a recommendation', async () => {
    const classifier = createNsfwImageClassifier({
      detect: () => [
        { label: 'porn', score: 0.9 },
        { label: 'neutral', score: 0.1 }
      ]
    })
    const result = await prescreenImage(classifier, {
      surface: 'messageInbox',
      body: '',
      metadata: { mediaKind: 'image/png' }
    })
    expect(result.recommendation).toBe('warn-explicit')
    expect(result.suggestedLabel).toBe('porn')
  })

  it('short-circuits to allow when the classifier does not support the input', async () => {
    const classifier = createNsfwImageClassifier({ detect: () => [{ label: 'porn', score: 1 }] })
    const result = await prescreenImage(classifier, { surface: 'messageInbox', body: 'just text' })
    expect(result.recommendation).toBe('allow')
  })
})
