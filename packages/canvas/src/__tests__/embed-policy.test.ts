/**
 * Tests for canvas iframe/embed security policies.
 */

import { describe, expect, it } from 'vitest'
import {
  evaluateCanvasEmbedPolicy,
  getCanvasEmbedProviderPolicies,
  getCanvasEmbedProviderPolicy
} from '../preview/embed-policy'

describe('canvas embed policy', () => {
  it('uses strict sandbox defaults for arbitrary iframe embeds', () => {
    const decision = evaluateCanvasEmbedPolicy({
      provider: 'generic',
      embedUrl: 'https://widgets.example.com/embed/1'
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('Arbitrary embeds require explicit workspace approval.')
    expect(decision.iframeAttributes).toEqual({
      sandbox: 'allow-scripts',
      allow: '',
      referrerPolicy: 'no-referrer',
      loading: 'lazy'
    })
    expect(decision.iframeAttributes.sandbox).not.toContain('allow-popups')
    expect(decision.iframeAttributes.sandbox).not.toContain('allow-top-navigation')
    expect(decision.iframeAttributes.sandbox).not.toContain('allow-forms')
  })

  it('allows arbitrary embeds only with explicit workspace approval', () => {
    const decision = evaluateCanvasEmbedPolicy({
      provider: 'generic',
      embedUrl: 'https://widgets.example.com/embed/1',
      allowArbitraryEmbeds: true
    })

    expect(decision.allowed).toBe(true)
    expect(decision.iframeAttributes.sandbox).toBe('allow-scripts')
    expect(decision.policy.metadataFetchingDefault).toBe(false)
  })

  it('keeps provider host allow policies explicit and reviewable', () => {
    const providers = getCanvasEmbedProviderPolicies()
    const youtube = getCanvasEmbedProviderPolicy('youtube')
    const spotify = getCanvasEmbedProviderPolicy('spotify')

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

  it('blocks provider spoofing through unexpected embed hosts', () => {
    const decision = evaluateCanvasEmbedPolicy({
      provider: 'youtube',
      embedUrl: 'https://evil.example.com/embed/video'
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe("Embed host 'evil.example.com' is not allowed for youtube.")
  })
})
