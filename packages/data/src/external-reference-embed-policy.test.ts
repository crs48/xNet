import { describe, expect, it } from 'vitest'
import { evaluateExternalReferenceEmbedPolicy } from './external-reference-embed-policy'

describe('external reference embed policy', () => {
  it('allows known provider iframe origins with strict defaults', () => {
    expect(
      evaluateExternalReferenceEmbedPolicy({
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        provider: 'youtube'
      })
    ).toMatchObject({
      allowed: true,
      provider: 'youtube',
      origin: 'https://www.youtube.com',
      sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation',
      referrerPolicy: 'strict-origin-when-cross-origin'
    })
  })

  it('blocks known providers when the workspace policy excludes them', () => {
    expect(
      evaluateExternalReferenceEmbedPolicy({
        sourceUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
        embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M',
        provider: 'spotify',
        policy: {
          allowedProviders: ['youtube']
        }
      })
    ).toMatchObject({
      allowed: false,
      provider: 'spotify',
      reason: 'provider-blocked'
    })
  })

  it('blocks spoofed provider origins', () => {
    expect(
      evaluateExternalReferenceEmbedPolicy({
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        embedUrl: 'https://evil.example/embed/dQw4w9WgXcQ',
        provider: 'youtube',
        policy: {
          allowArbitraryIframes: true
        }
      })
    ).toMatchObject({
      allowed: false,
      provider: 'youtube',
      origin: 'https://evil.example',
      reason: 'origin-blocked'
    })
  })

  it('blocks arbitrary iframes by default', () => {
    expect(
      evaluateExternalReferenceEmbedPolicy({
        sourceUrl: 'https://example.com/demo',
        embedUrl: 'https://example.com/embed/demo',
        provider: 'generic'
      })
    ).toMatchObject({
      allowed: false,
      provider: 'generic',
      reason: 'provider-blocked'
    })
  })

  it('allows explicit workspace origins and arbitrary iframe policy', () => {
    expect(
      evaluateExternalReferenceEmbedPolicy({
        sourceUrl: 'https://example.com/demo',
        embedUrl: 'https://example.com/embed/demo',
        provider: 'generic',
        policy: {
          allowedProviders: ['generic'],
          allowedOrigins: ['https://example.com'],
          sandbox: ['allow-scripts'],
          allow: 'fullscreen'
        }
      })
    ).toMatchObject({
      allowed: true,
      provider: 'generic',
      origin: 'https://example.com',
      sandbox: 'allow-scripts',
      allow: 'fullscreen'
    })

    expect(
      evaluateExternalReferenceEmbedPolicy({
        sourceUrl: 'https://dashboards.example/demo',
        embedUrl: 'https://dashboards.example/embed/demo',
        provider: 'generic',
        policy: {
          allowArbitraryIframes: true
        }
      })
    ).toMatchObject({
      allowed: true,
      provider: 'generic',
      origin: 'https://dashboards.example'
    })
  })

  it('requires https embed URLs', () => {
    expect(
      evaluateExternalReferenceEmbedPolicy({
        sourceUrl: 'https://example.com/demo',
        embedUrl: 'http://example.com/embed/demo',
        provider: 'generic'
      })
    ).toMatchObject({
      allowed: false,
      reason: 'invalid-embed-url'
    })
  })
})
