import { describe, expect, it } from 'vitest'
import {
  EMBED_PROVIDERS,
  detectEmbedProvider,
  normalizeExternalReferenceUrl,
  parseEmbedUrl,
  parseExternalReferenceUrl
} from './external-references'

describe('external reference parsing', () => {
  it('exports the supported embed providers', () => {
    expect(EMBED_PROVIDERS).toHaveLength(9)
    expect(EMBED_PROVIDERS.map((provider) => provider.name)).toEqual([
      'youtube',
      'vimeo',
      'spotify',
      'twitter',
      'instagram',
      'tiktok',
      'figma',
      'codesandbox',
      'loom'
    ])
  })

  it('normalizes bare urls and strips hashes', () => {
    expect(normalizeExternalReferenceUrl('example.com/path#section')).toBe(
      'https://example.com/path'
    )
    expect(normalizeExternalReferenceUrl('mailto:test@example.com')).toBeNull()
  })

  it('detects embed providers from supported urls', () => {
    expect(detectEmbedProvider('https://youtu.be/dQw4w9WgXcQ')?.name).toBe('youtube')
    expect(detectEmbedProvider('https://x.com/user/status/1234567890')?.name).toBe('twitter')
    expect(detectEmbedProvider('https://www.instagram.com/reel/C-qi579y7M9/')?.name).toBe(
      'instagram'
    )
    expect(
      detectEmbedProvider('https://www.tiktok.com/@scout2015/video/6718335390845095173')?.name
    ).toBe('tiktok')
    expect(detectEmbedProvider('https://example.com')).toBeNull()
  })

  it('parses embed urls into iframe targets', () => {
    expect(parseEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({
      id: 'dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
    })

    expect(
      parseEmbedUrl('https://www.figma.com/file/abc123def/storybook-rich-editor-spec')
    ).toMatchObject({
      id: 'file/abc123def'
    })

    expect(parseEmbedUrl('https://www.instagram.com/p/C-qi579y7M9/')).toMatchObject({
      id: 'p/C-qi579y7M9',
      embedUrl: 'https://www.instagram.com/p/C-qi579y7M9/embed/captioned'
    })

    expect(
      parseEmbedUrl('https://www.tiktok.com/@scout2015/video/6718335390845095173')
    ).toMatchObject({
      id: '@scout2015/6718335390845095173',
      embedUrl: 'https://www.tiktok.com/player/v1/6718335390845095173'
    })
  })

  it('parses github references into structured descriptors', () => {
    expect(parseExternalReferenceUrl('https://github.com/openai/openai/issues/123')).toMatchObject({
      provider: 'github',
      kind: 'issue',
      refId: 'openai/openai#123',
      title: 'openai#123'
    })

    expect(parseExternalReferenceUrl('https://github.com/openai/openai/pull/456')).toMatchObject({
      provider: 'github',
      kind: 'pull-request',
      refId: 'openai/openai#456',
      title: 'openai PR #456'
    })
  })

  it('parses embeddable references into structured descriptors', () => {
    expect(parseExternalReferenceUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({
      provider: 'youtube',
      kind: 'video',
      title: 'YouTube video',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
    })

    expect(
      parseExternalReferenceUrl('https://x.com/storybookjs/status/1606321052308658177')
    ).toMatchObject({
      provider: 'twitter',
      kind: 'social',
      title: 'Post from @storybookjs',
      embedUrl: 'https://platform.twitter.com/embed/Tweet.html?id=1606321052308658177'
    })

    expect(
      parseExternalReferenceUrl('https://www.figma.com/file/abc123def/storybook-rich-editor-spec')
    ).toMatchObject({
      provider: 'figma',
      kind: 'design',
      title: 'Storybook Rich Editor Spec',
      embedUrl:
        'https://www.figma.com/embed?embed_host=xnet&url=https://www.figma.com/file/abc123def'
    })

    expect(parseExternalReferenceUrl('https://www.instagram.com/p/C-qi579y7M9/')).toMatchObject({
      provider: 'instagram',
      kind: 'social',
      title: 'Instagram post',
      embedUrl: 'https://www.instagram.com/p/C-qi579y7M9/embed/captioned'
    })

    expect(
      parseExternalReferenceUrl('https://www.tiktok.com/@scout2015/video/6718335390845095173')
    ).toMatchObject({
      provider: 'tiktok',
      kind: 'social',
      title: 'TikTok video from @scout2015',
      embedUrl: 'https://www.tiktok.com/player/v1/6718335390845095173'
    })
  })

  it('falls back to generic descriptors for non-embeddable http urls', () => {
    expect(parseExternalReferenceUrl('https://www.example.com/some/path')).toMatchObject({
      provider: 'generic',
      kind: 'link',
      title: 'example.com'
    })
  })
})
