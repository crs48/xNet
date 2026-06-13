/**
 * Specialized media feed saved views over imported social content.
 *
 * These views open in the workbench feed presentation (grid/list with a
 * density control) so likes, playlists, and saved collections read as
 * content feeds instead of generic tables.
 */

import type { SavedViewDescriptor, SavedViewPresentationHint } from '@xnetjs/data'
import {
  and,
  defineNodeQueryAST,
  defineSavedViewDescriptor,
  queryOperators,
  validateSavedViewDescriptor
} from '@xnetjs/data'
import { SocialCollectionSchema, SocialContentSchema } from '../schemas'

export type SocialFeedViewId =
  | 'social.feed.youtube-videos'
  | 'social.feed.youtube-playlists'
  | 'social.feed.instagram-saved'
  | 'social.feed.instagram-likes'

export type SocialFeedViewScope = NonNullable<SavedViewDescriptor['scope']>

export type SocialFeedViewDefinition = {
  id: SocialFeedViewId
  title: string
  description: string
  platform: 'youtube' | 'instagram'
  descriptor: SavedViewDescriptor
  savedViewProperties: {
    title: string
    description: string
    descriptor: string
    scope: SocialFeedViewScope
  }
}

export type SocialFeedViewOptions = {
  scope?: SocialFeedViewScope
  pageSize?: number
}

const DEFAULT_FEED_PAGE_SIZE = 100

const DEFAULT_FEED_PRESENTATION: SavedViewPresentationHint = {
  mode: 'feed',
  feedLayout: 'grid',
  feedDensity: 'cozy'
}

function page(options: SocialFeedViewOptions) {
  return { first: options.pageSize ?? DEFAULT_FEED_PAGE_SIZE, count: 'estimate' as const }
}

function defineSocialFeedView(input: {
  id: SocialFeedViewId
  title: string
  description: string
  platform: SocialFeedViewDefinition['platform']
  query: SavedViewDescriptor['query']
  scope: SocialFeedViewScope
  presentation?: SavedViewPresentationHint
}): SocialFeedViewDefinition {
  const descriptor = defineSavedViewDescriptor({
    title: input.title,
    description: input.description,
    scope: input.scope,
    query: input.query,
    presentation: input.presentation ?? DEFAULT_FEED_PRESENTATION
  })
  const validation = validateSavedViewDescriptor(descriptor)

  if (!validation.valid) {
    throw new Error(`Invalid social feed view descriptor: ${input.id}`)
  }

  return {
    id: input.id,
    title: input.title,
    description: input.description,
    platform: input.platform,
    descriptor,
    savedViewProperties: {
      title: input.title,
      description: input.description,
      descriptor: JSON.stringify(descriptor),
      scope: input.scope
    }
  }
}

/**
 * Create the default platform feed views for imported social data.
 */
export function createDefaultSocialFeedViews(
  options: SocialFeedViewOptions = {}
): SocialFeedViewDefinition[] {
  const scope = options.scope ?? 'workspace'
  const content = queryOperators<(typeof SocialContentSchema)['_properties']>()
  const collection = queryOperators<(typeof SocialCollectionSchema)['_properties']>()

  return [
    defineSocialFeedView({
      id: 'social.feed.youtube-videos',
      title: 'YouTube Videos',
      description:
        'Every imported YouTube video — liked videos, playlist items, and watch history — as a thumbnail feed.',
      platform: 'youtube',
      scope,
      query: defineNodeQueryAST(SocialContentSchema, {
        where: and(content.eq('platform', 'youtube'), content.eq('contentKind', 'video')),
        orderBy: { publishedAt: 'desc', observedAt: 'desc', importedAt: 'desc' },
        page: page(options)
      })
    }),
    defineSocialFeedView({
      id: 'social.feed.youtube-playlists',
      title: 'YouTube Playlists',
      description: 'Imported YouTube playlists with item counts, as browsable collection cards.',
      platform: 'youtube',
      scope,
      query: defineNodeQueryAST(SocialCollectionSchema, {
        where: and(
          collection.eq('platform', 'youtube'),
          collection.eq('collectionKind', 'playlist')
        ),
        orderBy: { title: 'asc', observedAt: 'desc' },
        page: page(options)
      })
    }),
    defineSocialFeedView({
      id: 'social.feed.instagram-saved',
      title: 'Instagram Saved',
      description: 'Posts and music you saved on Instagram, newest first.',
      platform: 'instagram',
      scope,
      query: defineNodeQueryAST(SocialContentSchema, {
        where: and(
          content.eq('platform', 'instagram'),
          content.startsWith('platformContentKind', 'saved')
        ),
        orderBy: { observedAt: 'desc', importedAt: 'desc' },
        page: page(options)
      })
    }),
    defineSocialFeedView({
      id: 'social.feed.instagram-likes',
      title: 'Instagram Likes',
      description: 'Posts and comments you liked on Instagram, newest first.',
      platform: 'instagram',
      scope,
      query: defineNodeQueryAST(SocialContentSchema, {
        where: and(
          content.eq('platform', 'instagram'),
          content.startsWith('platformContentKind', 'liked')
        ),
        orderBy: { observedAt: 'desc', importedAt: 'desc' },
        page: page(options)
      })
    })
  ]
}
