/**
 * Canvas external-reference provider renderer tests.
 */

import { describe, expect, it } from 'vitest'
import { createCanvasExternalReferenceCardRenderer } from './canvasExternalReferenceCardRenderers'

describe('createCanvasExternalReferenceCardRenderer', () => {
  it('creates GitHub issue and pull request renderer descriptors', () => {
    expect(
      createCanvasExternalReferenceCardRenderer({
        url: 'https://github.com/openai/openai/issues/123',
        provider: 'github'
      })
    ).toMatchObject({
      providerId: 'github',
      kind: 'github-record',
      badgeLabel: 'GitHub issue',
      iconLabel: 'GH',
      metadata: [
        { label: 'Repo', value: 'openai/openai' },
        { label: 'Number', value: '123' }
      ]
    })

    expect(
      createCanvasExternalReferenceCardRenderer({
        url: 'https://github.com/openai/openai/pull/456',
        provider: 'github'
      })
    ).toMatchObject({
      badgeLabel: 'GitHub pull request'
    })
  })

  it('creates video renderer descriptors with live embed labels', () => {
    expect(
      createCanvasExternalReferenceCardRenderer({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        provider: 'youtube',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
      })
    ).toMatchObject({
      providerId: 'youtube',
      kind: 'video',
      accent: 'red',
      badgeLabel: 'YouTube video',
      liveBadgeLabel: 'YouTube video embed',
      previewLabel: 'Video player',
      metadata: [{ label: 'Video', value: 'dQw4w9WgXcQ' }]
    })
  })

  it('prefers parsed providers over generic persisted provider values', () => {
    expect(
      createCanvasExternalReferenceCardRenderer({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        provider: 'generic'
      })
    ).toMatchObject({
      providerId: 'youtube',
      kind: 'video'
    })
  })

  it('creates audio and design renderer descriptors', () => {
    expect(
      createCanvasExternalReferenceCardRenderer({
        url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
        provider: 'spotify'
      })
    ).toMatchObject({
      providerId: 'spotify',
      kind: 'audio',
      badgeLabel: 'Spotify playlist',
      metadata: [
        { label: 'Type', value: 'playlist' },
        { label: 'Id', value: '37i9dQZF1DXcBWIGoYBM5M' }
      ]
    })

    expect(
      createCanvasExternalReferenceCardRenderer({
        url: 'https://www.figma.com/file/abc123def/storybook-rich-editor-spec',
        provider: 'figma'
      })
    ).toMatchObject({
      providerId: 'figma',
      kind: 'design',
      badgeLabel: 'Figma design'
    })
  })

  it('falls back to generic link rendering for unknown providers', () => {
    expect(
      createCanvasExternalReferenceCardRenderer({
        url: 'https://example.com/plans/roadmap',
        provider: 'unknown-provider'
      })
    ).toMatchObject({
      providerId: 'generic',
      kind: 'link',
      badgeLabel: 'Link preview',
      metadata: [
        { label: 'Host', value: 'example.com' },
        { label: 'Path', value: '/plans/roadmap' }
      ]
    })
  })
})
