import { describe, expect, it } from 'vitest'
import { createCanvasPreviewModel, getCanvasPreviewCacheKey } from '../preview/model'

describe('canvas preview model', () => {
  it('infers available tiers and defaults to the richest available tier', () => {
    const model = createCanvasPreviewModel({
      objectId: 'media-1',
      objectKind: 'media',
      sourceRef: {
        nodeId: 'source-1',
        schemaId: 'xnet://xnet.fyi/MediaAsset@1.0.0',
        version: 4,
        contentHash: 'hash-1'
      },
      summary: {
        title: 'Reference image',
        status: 'ready'
      },
      thumbnail: {
        url: 'blob:preview',
        width: 320,
        height: 180,
        alt: 'Reference image preview'
      },
      shell: {
        title: 'Reference image',
        metadata: {
          mimeType: 'image/png'
        }
      },
      live: {
        activation: 'click-to-activate',
        budgetKey: 'media'
      },
      anchors: [
        {
          id: 'object',
          label: 'Whole object',
          kind: 'object'
        }
      ],
      actions: [
        {
          id: 'open',
          label: 'Open',
          kind: 'open'
        }
      ]
    })

    expect(model.id).toBe('media-1')
    expect(model.availableTiers).toEqual(['summary', 'thumbnail', 'shell', 'live'])
    expect(model.preferredTier).toBe('live')
    expect(model.anchors).toHaveLength(1)
    expect(model.actions).toHaveLength(1)
    expect(getCanvasPreviewCacheKey(model)).toBe(
      'media-1:source-1:xnet://xnet.fyi/MediaAsset@1.0.0:4:hash-1'
    )
  })

  it('falls back to a summary-only local preview model', () => {
    const model = createCanvasPreviewModel({
      objectId: 'shape-1',
      objectKind: 'shape',
      summary: {
        title: 'Rectangle'
      },
      preferredTier: 'live'
    })

    expect(model.availableTiers).toEqual(['summary'])
    expect(model.preferredTier).toBe('summary')
    expect(model.anchors).toEqual([])
    expect(model.actions).toEqual([])
    expect(getCanvasPreviewCacheKey(model)).toBe('shape-1:local:none:0:none')
  })
})
