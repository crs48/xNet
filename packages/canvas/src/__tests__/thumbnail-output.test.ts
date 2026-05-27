import { describe, expect, it } from 'vitest'
import {
  createCanvasThumbnailOutput,
  getCanvasThumbnailOutputCacheKey,
  type CanvasThumbnailOutputKind
} from '../preview/thumbnail-output'

describe('canvas thumbnail outputs', () => {
  it('creates deterministic generated thumbnails for supported placeholder kinds', () => {
    const kinds: readonly CanvasThumbnailOutputKind[] = [
      'pdf',
      'generic-file',
      'url-card',
      'audio-card',
      'iframe-placeholder'
    ]

    for (const kind of kinds) {
      const input = {
        kind,
        title: 'Quarterly planning artifact',
        subtitle: 'Workspace source',
        sourceRef: {
          nodeId: `${kind}-source`,
          schemaId: 'xnet://xnet.fyi/MediaAsset@1.0.0',
          version: 7,
          contentHash: `${kind}-hash`
        }
      }
      const first = createCanvasThumbnailOutput(input)
      const second = createCanvasThumbnailOutput(input)

      expect(first).toEqual(second)
      expect(first.generated).toBe(true)
      expect(first.url).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
      expect(first.mimeType).toBe('image/svg+xml')
      expect(first.cacheKey).toBe(
        `thumbnail:${kind}:${kind}-source:xnet://xnet.fyi/MediaAsset@1.0.0:7:${kind}-hash`
      )
    }
  })

  it('preserves source image and video poster URLs when available', () => {
    const image = createCanvasThumbnailOutput({
      kind: 'image',
      title: 'Reference image',
      mimeType: 'image/png',
      imageUrl: 'blob:image-1',
      width: 640,
      height: 360
    })
    const video = createCanvasThumbnailOutput({
      kind: 'video-poster',
      title: 'Interview clip',
      mimeType: 'image/jpeg',
      posterUrl: 'blob:poster-1'
    })

    expect(image).toMatchObject({
      url: 'blob:image-1',
      generated: false,
      mimeType: 'image/png',
      width: 640,
      height: 360
    })
    expect(video).toMatchObject({
      url: 'blob:poster-1',
      generated: false,
      mimeType: 'image/jpeg',
      width: 320,
      height: 180
    })
  })

  it('changes cache keys when source version or content hash changes', () => {
    const base = {
      kind: 'pdf' as const,
      title: 'Roadmap PDF',
      sourceRef: {
        nodeId: 'pdf-1',
        version: 1,
        contentHash: 'hash-1'
      }
    }

    expect(getCanvasThumbnailOutputCacheKey(base)).toBe('thumbnail:pdf:pdf-1:none:1:hash-1')
    expect(
      getCanvasThumbnailOutputCacheKey({
        ...base,
        sourceRef: {
          ...base.sourceRef,
          version: 2
        }
      })
    ).not.toBe(getCanvasThumbnailOutputCacheKey(base))
    expect(
      getCanvasThumbnailOutputCacheKey({
        ...base,
        sourceRef: {
          ...base.sourceRef,
          contentHash: 'hash-2'
        }
      })
    ).not.toBe(getCanvasThumbnailOutputCacheKey(base))
  })
})
