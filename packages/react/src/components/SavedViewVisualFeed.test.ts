import type { SavedViewVisualPreviewModel } from './savedViewVisualPreview'
import { describe, expect, it } from 'vitest'
import {
  buildFeedVirtualRowWindow,
  feedGridColumnCount,
  mergeFeedPreviews,
  mergeSavedViewFeedEnrichment
} from './SavedViewVisualFeed'

function preview(
  overrides: Partial<SavedViewVisualPreviewModel> = {}
): SavedViewVisualPreviewModel {
  return {
    id: 'query:node-1',
    sourceNodeId: 'node-1',
    sourceSchemaId: 'schema',
    kind: 'content',
    platform: 'youtube',
    title: 'YouTube video abc123',
    privacy: 'public',
    metrics: {},
    relationships: [],
    source: {},
    ...overrides
  }
}

describe('mergeSavedViewFeedEnrichment', () => {
  it('overrides placeholder fields with cached enrichment', () => {
    const merged = mergeSavedViewFeedEnrichment(preview(), {
      title: ' Real Title ',
      description: 'A description.',
      authorName: 'Channel',
      thumbnailUrl: 'blob:thumb'
    })

    expect(merged.title).toBe('Real Title')
    expect(merged.description).toBe('A description.')
    expect(merged.thumbnailUrl).toBe('blob:thumb')
    expect(merged.creator).toEqual({ label: 'Channel' })
  })

  it('keeps import data when enrichment is missing or empty', () => {
    const base = preview({ creator: { label: '@imported' } })

    expect(mergeSavedViewFeedEnrichment(base, null)).toBe(base)
    const merged = mergeSavedViewFeedEnrichment(base, {
      title: '',
      description: null,
      authorName: 'Someone Else',
      thumbnailUrl: undefined as unknown as string
    })
    expect(merged.title).toBe(base.title)
    expect(merged.creator).toEqual({ label: '@imported' })
  })
})

describe('mergeFeedPreviews', () => {
  it('maps every preview through the adapter lookup', () => {
    const previews = [preview(), preview({ id: 'query:node-2', sourceNodeId: 'node-2' })]
    const merged = mergeFeedPreviews(previews, {
      lookup: (candidate) => (candidate.sourceNodeId === 'node-2' ? { title: 'Enriched' } : null)
    })

    expect(merged[0]?.title).toBe('YouTube video abc123')
    expect(merged[1]?.title).toBe('Enriched')
  })

  it('returns the previews unchanged without an adapter', () => {
    const previews = [preview()]
    expect(mergeFeedPreviews(previews, undefined)).toEqual(previews)
  })
})

describe('feedGridColumnCount', () => {
  it('fits columns to the measured width per density', () => {
    expect(feedGridColumnCount(660, 'cozy')).toBe(3)
    expect(feedGridColumnCount(220, 'cozy')).toBe(1)
    expect(feedGridColumnCount(1400, 'compact')).toBe(6)
    expect(feedGridColumnCount(1400, 'comfortable')).toBe(4)
  })

  it('never returns less than one column and uses the max before measuring', () => {
    expect(feedGridColumnCount(50, 'comfortable')).toBe(1)
    expect(feedGridColumnCount(0, 'cozy')).toBe(5)
  })
})

describe('buildFeedVirtualRowWindow', () => {
  it('passes through measured virtualizer rows', () => {
    const window = buildFeedVirtualRowWindow({
      virtualRows: [
        { key: 'a', index: 3, start: 600 },
        { key: 'b', index: 4, start: 800 }
      ],
      rowCount: 20,
      estimateRowHeight: 200
    })

    expect(window.rows.map((row) => row.index)).toEqual([3, 4])
    expect(window.rows.every((row) => row.measured)).toBe(true)
    expect(window.visibleStart).toBe(3)
    expect(window.visibleEnd).toBe(4)
  })

  it('falls back to an estimated window before the virtualizer measures', () => {
    const window = buildFeedVirtualRowWindow({
      virtualRows: [],
      rowCount: 2,
      estimateRowHeight: 100
    })

    expect(window.rows).toEqual([
      { key: 'initial-0', index: 0, start: 0, measured: false },
      { key: 'initial-1', index: 1, start: 100, measured: false }
    ])
    expect(window.visibleStart).toBe(0)
    expect(window.visibleEnd).toBe(1)
  })

  it('handles empty feeds', () => {
    const window = buildFeedVirtualRowWindow({
      virtualRows: [],
      rowCount: 0,
      estimateRowHeight: 100
    })

    expect(window.rows).toEqual([])
    expect(window.visibleStart).toBe(0)
    expect(window.visibleEnd).toBe(0)
  })
})
