import { describe, expect, it } from 'vitest'
import {
  evaluateEmbedRegistryPolicy,
  getEmbedRegistryProviderPolicies,
  getEmbedRegistryProviderPolicy
} from './embed-registry'

describe('embed registry', () => {
  it('keeps provider policies explicit and reviewable', () => {
    const providers = getEmbedRegistryProviderPolicies()
    const youtube = getEmbedRegistryProviderPolicy('youtube')
    const spotify = getEmbedRegistryProviderPolicy('spotify')

    expect(providers.map((policy) => policy.provider)).toEqual([
      'youtube',
      'spotify',
      'vimeo',
      'loom',
      'figma',
      'codesandbox',
      'generic'
    ])
    expect(youtube.allowedHostnames).toContain('www.youtube.com')
    expect(youtube.iframeAttributes.allow).toContain('fullscreen')
    expect(spotify.allowedHostnames).toEqual(['open.spotify.com'])
    expect(spotify.iframeAttributes.sandbox).toBe(
      'allow-scripts allow-same-origin allow-presentation'
    )
  })

  it('allows known provider iframe origins through the shared policy evaluator', () => {
    expect(
      evaluateEmbedRegistryPolicy({
        provider: 'youtube',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
      })
    ).toMatchObject({
      allowed: true,
      provider: 'youtube',
      iframeAttributes: {
        sandbox: 'allow-scripts allow-same-origin allow-presentation',
        loading: 'lazy'
      }
    })
  })

  it('blocks provider spoofing through unexpected embed hosts', () => {
    expect(
      evaluateEmbedRegistryPolicy({
        provider: 'youtube',
        embedUrl: 'https://evil.example.com/embed/video'
      })
    ).toMatchObject({
      allowed: false,
      provider: 'youtube',
      reason: "Embed host 'evil.example.com' is not allowed for youtube."
    })
  })

  it('allows arbitrary embeds only with explicit workspace approval', () => {
    expect(
      evaluateEmbedRegistryPolicy({
        provider: 'generic',
        embedUrl: 'https://widgets.example.com/embed/1'
      })
    ).toMatchObject({
      allowed: false,
      reason: 'Arbitrary embeds require explicit workspace approval.',
      iframeAttributes: {
        sandbox: 'allow-scripts',
        allow: '',
        referrerPolicy: 'no-referrer',
        loading: 'lazy'
      }
    })

    expect(
      evaluateEmbedRegistryPolicy({
        provider: 'generic',
        embedUrl: 'https://widgets.example.com/embed/1',
        allowArbitraryEmbeds: true
      })
    ).toMatchObject({
      allowed: true,
      provider: 'generic'
    })
  })
})
