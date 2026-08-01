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
import { SocialCollectionSchema, SocialContentSchema, SocialInteractionSchema } from '../schemas'

export type SocialFeedViewId =
  | 'social.feed.youtube-videos'
  | 'social.feed.youtube-playlists'
  | 'social.feed.instagram-saved'
  | 'social.feed.instagram-likes'
  | 'social.feed.tiktok-videos'
  | 'social.feed.tiktok-collections'
  | 'social.feed.activity-timeline'

export type SocialFeedViewScope = NonNullable<SavedViewDescriptor['scope']>

export type SocialFeedViewDefinition = {
  id: SocialFeedViewId
  title: string
  description: string
  platform: 'youtube' | 'instagram' | 'tiktok' | 'all'
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

/**
 * The activity view opens on the time axis rather than the grid.
 *
 * Interactions carry a timestamp and no thumbnail of their own, so a grid of
 * them would be a grid of blank cards; the same records read well as a
 * calendar of when things were watched, liked and saved.
 */
const TIMELINE_PRESENTATION: SavedViewPresentationHint = {
  mode: 'timeline',
  feedLayout: 'list',
  feedDensity: 'compact'
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
  const interaction = queryOperators<(typeof SocialInteractionSchema)['_properties']>()

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
    }),
    defineSocialFeedView({
      id: 'social.feed.tiktok-videos',
      title: 'TikTok Videos',
      description:
        'Videos you liked or added to favourites on TikTok, newest first. TikTok records the like and the favourite as separate acts against the same video, so both land here.',
      platform: 'tiktok',
      scope,
      query: defineNodeQueryAST(SocialContentSchema, {
        where: and(content.eq('platform', 'tiktok'), content.eq('contentKind', 'video')),
        orderBy: { observedAt: 'desc', publishedAt: 'desc', importedAt: 'desc' },
        page: page(options)
      })
    }),
    defineSocialFeedView({
      id: 'social.feed.tiktok-collections',
      title: 'TikTok Collections',
      description: 'Your TikTok favourite folders and topic collections, as browsable cards.',
      platform: 'tiktok',
      scope,
      query: defineNodeQueryAST(SocialCollectionSchema, {
        where: collection.eq('platform', 'tiktok'),
        orderBy: { title: 'asc', observedAt: 'desc' },
        page: page(options)
      })
    }),
    defineSocialFeedView({
      id: 'social.feed.activity-timeline',
      title: 'Activity Timeline',
      description:
        'Everything you watched, liked, saved and bookmarked across platforms, on the time axis. Search history is deliberately absent — it is the most revealing bucket in the archive and the least useful as a calendar.',
      platform: 'all',
      scope,
      presentation: TIMELINE_PRESENTATION,
      query: defineNodeQueryAST(SocialInteractionSchema, {
        where: and(
          interaction.neq('interactionKind', 'search'),
          interaction.neq('interactionKind', 'message')
        ),
        orderBy: { observedAt: 'desc', publishedAt: 'desc', importedAt: 'desc' },
        page: page(options)
      })
    })
  ]
}
