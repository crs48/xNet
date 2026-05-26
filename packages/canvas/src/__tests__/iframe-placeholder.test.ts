import { describe, expect, it } from 'vitest'
import {
  createCanvasIframeExportPreview,
  createCanvasIframePlaceholderThumbnail,
  isCanvasIframePlaceholderPreview
} from '../preview/iframe-placeholder'

describe('canvas iframe placeholders', () => {
  it('creates deterministic generated thumbnails for live iframe placeholders', () => {
    const input = {
      objectId: 'embed-1',
      title: 'Launch planning video',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      provider: 'youtube',
      sourceRef: {
        nodeId: 'external-ref-1',
        schemaId: 'xnet://xnet.fyi/ExternalReference@1.0.0',
        version: 2,
        contentHash: 'source-hash'
      }
    }

    const first = createCanvasIframePlaceholderThumbnail(input)
    const second = createCanvasIframePlaceholderThumbnail(input)

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      kind: 'iframe-placeholder',
      generated: true,
      mimeType: 'image/svg+xml',
      cacheKey:
        'thumbnail:iframe-placeholder:external-ref-1:xnet://xnet.fyi/ExternalReference@1.0.0:2:source-hash',
      alt: 'Launch planning video thumbnail'
    })
    expect(first.url).toContain('EMBED')
  })

  it('creates export-safe preview models without live iframe tiers', () => {
    const preview = createCanvasIframeExportPreview({
      objectId: 'embed-2',
      title: 'Vendor playlist',
      url: 'https://open.spotify.com/playlist/abc123',
      embedUrl: 'https://open.spotify.com/embed/playlist/abc123',
      provider: 'spotify',
      reason: 'export'
    })

    expect(isCanvasIframePlaceholderPreview(preview)).toBe(true)
    expect(preview.live).toBeUndefined()
    expect(preview.availableTiers).toEqual(['summary', 'thumbnail', 'shell'])
    expect(preview.preferredTier).toBe('thumbnail')
    expect(preview.summary).toMatchObject({
      title: 'Vendor playlist',
      subtitle: 'Spotify',
      status: 'ready'
    })
    expect(preview.shell?.metadata).toMatchObject({
      iframePlaceholder: true,
      exportSafe: true,
      placeholderReason: 'export',
      provider: 'spotify',
      url: 'https://open.spotify.com/playlist/abc123',
      embedUrl: 'https://open.spotify.com/embed/playlist/abc123'
    })
    expect(preview.actions.map((action) => action.kind)).toEqual(['open', 'copy-link'])
  })

  it('marks provider-denied placeholders while keeping source recovery actions', () => {
    const preview = createCanvasIframeExportPreview({
      objectId: 'embed-3',
      title: 'Private recording',
      url: 'https://vimeo.com/12345',
      embedUrl: 'https://player.vimeo.com/video/12345',
      provider: 'vimeo',
      reason: 'provider-denied'
    })

    expect(preview.shell?.metadata).toMatchObject({
      iframePlaceholder: true,
      placeholderReason: 'provider-denied',
      provider: 'vimeo'
    })
    expect(preview.actions).toEqual([
      {
        id: 'open-source',
        label: 'Open source',
        kind: 'open'
      },
      {
        id: 'copy-link',
        label: 'Copy link',
        kind: 'copy-link'
      }
    ])
  })
})
