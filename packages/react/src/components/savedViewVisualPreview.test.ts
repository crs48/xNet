/**
 * @xnetjs/react - Tests for saved view visual preview derivation.
 */

import { describe, expect, it } from 'vitest'
import {
  createSavedViewCanvasProjectionNodes,
  createSavedViewVisualPreviewFingerprint,
  deriveCachedSavedViewVisualPreviews,
  deriveSavedViewTimelineBuckets,
  deriveSavedViewVisualPreview,
  deriveSavedViewVisualPreviews,
  hasSavedViewVisualPreviewSensitiveData,
  isSavedViewVisualPreviewEmbeddable,
  savedViewVisualPreviewIsSelfActor
} from './savedViewVisualPreview'

describe('saved view visual previews', () => {
  it('derives rich previews for social content URLs', () => {
    const preview = deriveSavedViewVisualPreview(
      {
        id: 'content-1',
        schemaId: 'xnet://xnet.fyi/SocialContent@1.0.0',
        platform: 'youtube',
        contentKind: 'video',
        canonicalUrl: 'https://www.youtube.com/watch?v=abc123',
        actorHandle: '@example',
        title: 'Example Video',
        publishedAt: Date.UTC(2026, 0, 1),
        privacyClass: 'public',
        visibility: 'public',
        authorActor: 'actor-1',
        itemCount: 3
      },
      {
        queryId: 'content',
        rowRole: 'Social Content',
        schemaId: 'xnet://xnet.fyi/SocialContent@1.0.0',
        schemaName: 'Social Content'
      }
    )

    expect(preview).toMatchObject({
      id: 'content:content-1',
      sourceNodeId: 'content-1',
      kind: 'content',
      platform: 'youtube',
      title: 'Example Video',
      creator: { id: 'actor-1', label: '@example' },
      url: 'https://www.youtube.com/watch?v=abc123',
      embedUrl: 'https://www.youtube.com/embed/abc123',
      provider: 'youtube',
      thumbnailUrl: 'https://img.youtube.com/vi/abc123/hqdefault.jpg',
      privacy: 'public',
      metrics: { itemCount: 3 },
      relationships: [{ kind: 'author', targetNodeId: 'actor-1' }]
    })
    expect(isSavedViewVisualPreviewEmbeddable(preview)).toBe(true)
  })

  it('derives descriptions and platform content ids for feed rendering', () => {
    const preview = deriveSavedViewVisualPreview({
      id: 'content-2',
      schemaId: 'xnet://xnet.fyi/SocialContent@1.0.0',
      platform: 'instagram',
      contentKind: 'post',
      platformContentId: 'post-42',
      title: 'Saved post',
      textPreview: 'A longer caption preview for the saved post.',
      privacyClass: 'public',
      visibility: 'public'
    })

    expect(preview).toMatchObject({
      title: 'Saved post',
      description: 'A longer caption preview for the saved post.',
      platformContentId: 'post-42'
    })
  })

  it('omits descriptions that duplicate the derived title', () => {
    const preview = deriveSavedViewVisualPreview({
      id: 'content-3',
      schemaId: 'xnet://xnet.fyi/SocialContent@1.0.0',
      platform: 'instagram',
      textPreview: 'Caption only post',
      privacyClass: 'public'
    })

    expect(preview.title).toBe('Caption only post')
    expect(preview.description).toBeUndefined()
  })

  it('derives actor previews and detects self actors', () => {
    const row = {
      id: 'actor-1',
      schemaId: 'xnet://xnet.fyi/SocialActor@1.0.0',
      displayName: 'Ada Lovelace',
      handle: '@ada',
      profileUrl: 'https://instagram.com/ada',
      platform: 'instagram',
      privacyClass: 'public',
      isSelf: true
    }
    const preview = deriveSavedViewVisualPreview(row, {
      queryId: 'actors',
      rowRole: 'Social Actor',
      schemaId: 'xnet://xnet.fyi/SocialActor@1.0.0',
      schemaName: 'Social Actor'
    })

    expect(preview.kind).toBe('actor')
    expect(preview.platform).toBe('instagram')
    expect(preview.title).toBe('Ada Lovelace')
    expect(preview.creator?.label).toBe('@ada')
    expect(preview.provider).toBe('generic')
    expect(savedViewVisualPreviewIsSelfActor(row)).toBe(true)
  })

  it('uses external references from messages without loading provider embeds by default', () => {
    const preview = deriveSavedViewVisualPreview(
      {
        id: 'message-1',
        schemaId: 'xnet://xnet.fyi/SocialMessage@1.0.0',
        platform: 'openai',
        messageKind: 'assistant',
        textPreview: 'Here is a useful source.',
        externalRefsJson: JSON.stringify([
          {
            url: 'https://example.com/research',
            title: 'Research source'
          }
        ]),
        senderHandle: 'assistant',
        sentAt: '2026-01-02T03:04:05.000Z',
        privacyClass: 'private'
      },
      {
        queryId: 'messages',
        rowRole: 'Social Message',
        schemaId: 'xnet://xnet.fyi/SocialMessage@1.0.0',
        schemaName: 'Social Message'
      }
    )

    expect(preview.kind).toBe('message')
    expect(preview.url).toBe('https://example.com/research')
    expect(preview.provider).toBe('generic')
    expect(preview.privacy).toBe('private')
    expect(hasSavedViewVisualPreviewSensitiveData(preview)).toBe(true)
    expect(isSavedViewVisualPreviewEmbeddable(preview)).toBe(false)
  })

  it('buckets previews by month for timeline rendering', () => {
    const previews = deriveSavedViewVisualPreviews(
      [
        {
          id: 'content-1',
          schemaId: 'xnet://schema/content',
          title: 'First',
          platform: 'youtube',
          contentKind: 'video',
          publishedAt: Date.UTC(2026, 0, 2)
        },
        {
          id: 'content-2',
          schemaId: 'xnet://schema/content',
          title: 'Second',
          platform: 'youtube',
          contentKind: 'video',
          publishedAt: Date.UTC(2026, 0, 3)
        },
        {
          id: 'content-3',
          schemaId: 'xnet://schema/content',
          title: 'Third',
          platform: 'reddit',
          contentKind: 'post',
          publishedAt: Date.UTC(2025, 11, 31)
        }
      ],
      {
        queryId: 'content',
        rowRole: 'Social Content',
        schemaId: 'xnet://schema/content',
        schemaName: 'Social Content'
      }
    )

    const buckets = deriveSavedViewTimelineBuckets(previews)

    expect(buckets.map((bucket) => bucket.count)).toEqual([2, 1])
    expect(buckets[0].key).toBe(`month:${Date.UTC(2026, 0, 1)}`)
  })

  it('creates bounded source-backed canvas projection inputs', () => {
    const previews = deriveSavedViewVisualPreviews(
      [
        {
          id: 'content-1',
          schemaId: 'xnet://schema/content',
          title: 'First',
          platform: 'youtube',
          contentKind: 'video',
          privacyClass: 'public',
          canonicalUrl: 'https://www.youtube.com/watch?v=abc123'
        },
        {
          id: 'actor-1',
          schemaId: 'xnet://schema/actor',
          displayName: 'Ada',
          handle: '@ada',
          platform: 'instagram'
        }
      ],
      {
        queryId: 'mixed',
        rowRole: 'Social Content',
        schemaId: 'xnet://schema/content',
        schemaName: 'Social Content'
      }
    )

    expect(createSavedViewCanvasProjectionNodes(previews, { groupBy: 'platform' })).toEqual([
      {
        id: 'content-1',
        schemaId: 'xnet://schema/content',
        kind: 'content',
        title: 'First',
        subtitle: expect.any(String),
        platform: 'youtube',
        privacyClass: 'public',
        groupKey: 'youtube'
      },
      {
        id: 'actor-1',
        schemaId: 'xnet://schema/actor',
        kind: 'actor',
        title: 'Ada',
        subtitle: expect.any(String),
        platform: 'instagram',
        privacyClass: 'unknown',
        groupKey: 'instagram'
      }
    ])
  })

  it('fingerprints previews by descriptor, query, and row versions', () => {
    const descriptor = {
      version: 1,
      title: 'Content',
      query: { version: 1, kind: 'node', schemaId: 'xnet://schema/content' }
    } as const
    const first = createSavedViewVisualPreviewFingerprint({
      descriptor,
      query: { queryId: 'content', schemaId: 'xnet://schema/content' },
      rows: [{ id: 'content-1', updatedAt: 1 }]
    })
    const second = createSavedViewVisualPreviewFingerprint({
      descriptor,
      query: { queryId: 'content', schemaId: 'xnet://schema/content' },
      rows: [{ id: 'content-1', updatedAt: 2 }]
    })

    expect(first).not.toBe(second)
  })

  it('caches preview derivation by descriptor, query, and row versions', () => {
    const input = {
      descriptor: {
        version: 1,
        title: 'Content',
        query: { version: 1, kind: 'node', schemaId: 'xnet://schema/content' }
      } as const,
      query: {
        queryId: 'content',
        rowRole: 'Social Content',
        schemaId: 'xnet://schema/content',
        schemaName: 'Social Content'
      },
      rows: [{ id: 'content-1', updatedAt: 1, title: 'Cached item' }]
    }

    const first = deriveCachedSavedViewVisualPreviews(input)
    const second = deriveCachedSavedViewVisualPreviews(input)
    const changed = deriveCachedSavedViewVisualPreviews({
      ...input,
      rows: [{ id: 'content-1', updatedAt: 2, title: 'Cached item' }]
    })

    expect(second).toBe(first)
    expect(changed).not.toBe(first)
  })
})
