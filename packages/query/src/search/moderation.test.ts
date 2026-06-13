import { describe, expect, it } from 'vitest'
import { summarizeSearchModeration } from './moderation'

describe('summarizeSearchModeration', () => {
  it('hides high-confidence abuse labels and demotes warning labels', () => {
    const hidden = summarizeSearchModeration({
      labels: [{ value: 'spam', confidence: 0.9 }]
    })
    expect(hidden.includeInSearch).toBe(false)
    expect(hidden.reasons).toContain('label:spam')

    const demoted = summarizeSearchModeration({
      labels: [{ value: 'slop', confidence: 0.8, sourceWeight: 2 }]
    })
    expect(demoted.includeInSearch).toBe(true)
    expect(demoted.scoreMultiplier).toBeLessThan(1)
  })

  it('does not filter sensitivity labels unless the viewer asks', () => {
    const result = summarizeSearchModeration({
      labels: [{ value: 'porn', confidence: 1, sourceWeight: 0.5 }]
    })
    // sensitivity is a per-viewer concern; absent a viewer policy, it is shown
    expect(result.includeInSearch).toBe(true)
    expect(result.reasons).toEqual([])
  })

  it('hides results carrying a present sensitivity label the viewer chose to hide', () => {
    const result = summarizeSearchModeration(
      { labels: [{ value: 'porn', confidence: 1, sourceWeight: 0.5 }] },
      { sensitivityHiddenLabels: ['porn', 'sexual'] }
    )
    expect(result.includeInSearch).toBe(false)
    expect(result.reasons).toContain('sensitivity:porn')
  })

  it('ignores a weak (below-floor) sensitivity signal', () => {
    const result = summarizeSearchModeration(
      { labels: [{ value: 'sexual', confidence: 0.2, sourceWeight: 0.05 }] },
      { sensitivityHiddenLabels: ['sexual'] }
    )
    expect(result.includeInSearch).toBe(true)
  })

  it('a stronger safe label spares the result from sensitivity hiding', () => {
    const result = summarizeSearchModeration(
      {
        labels: [
          { value: 'porn', confidence: 0.5, sourceWeight: 0.5 },
          { value: 'safe', confidence: 0.9 }
        ]
      },
      { sensitivityHiddenLabels: ['porn'] }
    )
    expect(result.includeInSearch).toBe(true)
  })
})
