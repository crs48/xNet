/**
 * Canvas external-reference embed fallback descriptor tests.
 */

import { evaluateExternalReferenceEmbedPolicy } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { createCanvasExternalReferenceEmbedFallback } from './canvasExternalReferenceEmbedFallbacks'

describe('createCanvasExternalReferenceEmbedFallback', () => {
  it('describes workspace policy blocks as non-live fallback cards', () => {
    const policyDecision = evaluateExternalReferenceEmbedPolicy({
      sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      provider: 'youtube',
      policy: {
        allowedProviders: ['spotify']
      }
    })

    const fallback = createCanvasExternalReferenceEmbedFallback({
      policyDecision,
      providerLabel: 'YouTube',
      emptyStateLabel: 'YouTube source'
    })

    expect(fallback).toMatchObject({
      reason: 'provider-blocked',
      label: 'Embed blocked',
      tone: 'danger',
      disablesLiveEmbed: true
    })
    expect(fallback?.description).toBe('Workspace policy does not allow live embeds from YouTube.')
  })

  it('describes blocked provider origins as non-live fallback cards', () => {
    const policyDecision = evaluateExternalReferenceEmbedPolicy({
      sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://evil.example.com/embed/dQw4w9WgXcQ',
      provider: 'youtube',
      policy: {
        allowArbitraryIframes: true
      }
    })

    const fallback = createCanvasExternalReferenceEmbedFallback({
      policyDecision,
      providerLabel: 'YouTube',
      emptyStateLabel: 'YouTube source'
    })

    expect(fallback).toMatchObject({
      reason: 'origin-blocked',
      label: 'Embed blocked',
      tone: 'danger',
      disablesLiveEmbed: true
    })
    expect(fallback?.description).toBe('This embed uses an origin that is not allowed for YouTube.')
  })

  it('turns offline lifecycle state into a live-embed fallback', () => {
    const policyDecision = evaluateExternalReferenceEmbedPolicy({
      sourceUrl: 'https://open.spotify.com/playlist/abc123',
      embedUrl: 'https://open.spotify.com/embed/playlist/abc123',
      provider: 'spotify'
    })

    const fallback = createCanvasExternalReferenceEmbedFallback({
      policyDecision,
      lifecycleStatus: 'offline',
      providerLabel: 'Spotify',
      emptyStateLabel: 'Spotify source'
    })

    expect(fallback).toMatchObject({
      reason: 'offline',
      label: 'Embed offline',
      tone: 'warning',
      disablesLiveEmbed: true
    })
  })

  it('preserves provider-denied metadata as a recoverable fallback reason', () => {
    const policyDecision = evaluateExternalReferenceEmbedPolicy({
      sourceUrl: 'https://vimeo.com/12345',
      embedUrl: 'https://player.vimeo.com/video/12345',
      provider: 'vimeo'
    })

    const fallback = createCanvasExternalReferenceEmbedFallback({
      policyDecision,
      metadataResult: {
        status: 'blocked',
        metadata: null,
        reason: 'oEmbed request failed with 403',
        source: 'oembed',
        sourceUrl: 'https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F12345'
      },
      providerLabel: 'Vimeo',
      emptyStateLabel: 'Vimeo source'
    })

    expect(fallback).toMatchObject({
      reason: 'provider-denied',
      label: 'Provider denied',
      tone: 'danger',
      disablesLiveEmbed: false
    })
  })
})
