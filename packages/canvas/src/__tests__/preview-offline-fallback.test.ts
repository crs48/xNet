import { describe, expect, it } from 'vitest'
import {
  createCanvasOfflinePreviewFallback,
  createCanvasPreviewModel,
  isCanvasOfflinePreviewFallback
} from '../index'

describe('canvas preview offline fallback', () => {
  it('preserves cached preview tiers while removing live activation', () => {
    const model = createCanvasPreviewModel({
      objectId: 'embed-1',
      objectKind: 'external-reference',
      sourceRef: {
        nodeId: 'source-1',
        schemaId: 'xnet://xnet.fyi/ExternalReference@1.0.0',
        version: 4,
        contentHash: 'hash-1'
      },
      summary: {
        title: 'Planning playlist',
        subtitle: 'Spotify',
        status: 'ready'
      },
      thumbnail: {
        url: 'blob:playlist-poster',
        width: 320,
        height: 180
      },
      shell: {
        title: 'Planning playlist',
        metadata: {
          provider: 'spotify'
        }
      },
      live: {
        provider: 'spotify',
        embedUrl: 'https://open.spotify.com/embed/playlist/1',
        activation: 'click-to-activate',
        budgetKey: 'spotify'
      },
      actions: [
        {
          id: 'open',
          label: 'Open',
          kind: 'open'
        }
      ]
    })

    const fallback = createCanvasOfflinePreviewFallback({
      model,
      reason: 'provider-unreachable',
      message: 'Provider is unreachable. Cached preview is still available.'
    })

    expect(isCanvasOfflinePreviewFallback(fallback)).toBe(true)
    expect(fallback.availableTiers).toEqual(['summary', 'thumbnail', 'shell'])
    expect(fallback.preferredTier).toBe('thumbnail')
    expect(fallback.live).toBeUndefined()
    expect(fallback.thumbnail).toBe(model.thumbnail)
    expect(fallback.summary).toMatchObject({
      title: 'Planning playlist',
      subtitle: 'Spotify',
      status: 'offline',
      description: 'Provider is unreachable. Cached preview is still available.'
    })
    expect(fallback.shell?.metadata).toMatchObject({
      provider: 'spotify',
      offline: true,
      offlineReason: 'provider-unreachable'
    })
    expect(fallback.actions.map((action) => action.kind)).toEqual(['retry', 'open'])
  })

  it('does not duplicate existing retry actions', () => {
    const model = createCanvasPreviewModel({
      objectId: 'pdf-1',
      objectKind: 'media',
      summary: {
        title: 'Research packet'
      },
      actions: [
        {
          id: 'retry-preview',
          label: 'Try again',
          kind: 'retry'
        }
      ]
    })
    const fallback = createCanvasOfflinePreviewFallback({ model })

    expect(fallback.actions).toHaveLength(1)
    expect(fallback.actions[0]).toMatchObject({
      id: 'retry-preview',
      label: 'Try again',
      kind: 'retry'
    })
  })

  it('creates a summary and shell fallback when no cached thumbnail exists', () => {
    const model = createCanvasPreviewModel({
      objectId: 'link-1',
      objectKind: 'external-reference',
      summary: {
        title: 'Design brief'
      }
    })
    const fallback = createCanvasOfflinePreviewFallback({ model })

    expect(fallback.availableTiers).toEqual(['summary', 'shell'])
    expect(fallback.preferredTier).toBe('summary')
    expect(fallback.summary).toMatchObject({
      title: 'Design brief',
      subtitle: 'Offline',
      status: 'offline'
    })
    expect(fallback.shell?.metadata).toMatchObject({
      offline: true,
      offlineReason: 'network-unavailable'
    })
  })
})
