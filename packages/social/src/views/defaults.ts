/**
 * Default saved views for the canonical social graph.
 */

import type { SavedViewDescriptor } from '@xnetjs/data'
import {
  defineNodeQueryAST,
  defineSavedViewDescriptor,
  validateSavedViewDescriptor
} from '@xnetjs/data'
import {
  SocialActorSchema,
  SocialCollectionSchema,
  SocialContentSchema,
  SocialImportRunSchema,
  SocialInteractionSchema,
  SocialMessageSchema
} from '../schemas'

export type SocialSavedViewId =
  | 'social.people'
  | 'social.content'
  | 'social.interactions'
  | 'social.messages'
  | 'social.collections'
  | 'social.import-runs'

export type SocialSavedViewScope = NonNullable<SavedViewDescriptor['scope']>

export type SocialSavedViewDefinition = {
  id: SocialSavedViewId
  title: string
  description: string
  descriptor: SavedViewDescriptor
  savedViewProperties: {
    title: string
    description: string
    descriptor: string
    scope: SocialSavedViewScope
  }
}

export type SocialSavedViewOptions = {
  scope?: SocialSavedViewScope
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 100

function page(options: SocialSavedViewOptions) {
  return { first: options.pageSize ?? DEFAULT_PAGE_SIZE, count: 'estimate' as const }
}

function defineSocialSavedView(input: {
  id: SocialSavedViewId
  title: string
  description: string
  query: SavedViewDescriptor['query']
  scope: SocialSavedViewScope
}): SocialSavedViewDefinition {
  const descriptor = defineSavedViewDescriptor({
    title: input.title,
    description: input.description,
    scope: input.scope,
    query: input.query
  })
  const validation = validateSavedViewDescriptor(descriptor)

  if (!validation.valid) {
    throw new Error(`Invalid social saved view descriptor: ${input.id}`)
  }

  return {
    id: input.id,
    title: input.title,
    description: input.description,
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
 * Create the default database/list saved views for imported social data.
 */
export function createDefaultSocialSavedViews(
  options: SocialSavedViewOptions = {}
): SocialSavedViewDefinition[] {
  const scope = options.scope ?? 'workspace'

  return [
    defineSocialSavedView({
      id: 'social.people',
      title: 'People',
      description: 'External social actors imported from platform exports.',
      scope,
      query: defineNodeQueryAST(SocialActorSchema, {
        orderBy: { displayName: 'asc', handle: 'asc' },
        page: page(options)
      })
    }),
    defineSocialSavedView({
      id: 'social.content',
      title: 'Content',
      description: 'Posts, reels, comments, links, and generated media across platforms.',
      scope,
      query: defineNodeQueryAST(SocialContentSchema, {
        orderBy: { publishedAt: 'desc', observedAt: 'desc', importedAt: 'desc' },
        page: page(options)
      })
    }),
    defineSocialSavedView({
      id: 'social.interactions',
      title: 'Interactions',
      description: 'Likes, saves, follows, prompts, citations, comments, and other edges.',
      scope,
      query: defineNodeQueryAST(SocialInteractionSchema, {
        orderBy: { observedAt: 'desc', publishedAt: 'desc', importedAt: 'desc' },
        page: page(options)
      })
    }),
    defineSocialSavedView({
      id: 'social.messages',
      title: 'Messages',
      description: 'DM and AI conversation messages kept separate from public content.',
      scope,
      query: defineNodeQueryAST(SocialMessageSchema, {
        orderBy: { sentAt: 'desc', importedAt: 'desc' },
        page: page(options)
      })
    }),
    defineSocialSavedView({
      id: 'social.collections',
      title: 'Collections',
      description: 'Saved collections, projects, folders, playlists, and imported lists.',
      scope,
      query: defineNodeQueryAST(SocialCollectionSchema, {
        orderBy: { title: 'asc', observedAt: 'desc' },
        page: page(options)
      })
    }),
    defineSocialSavedView({
      id: 'social.import-runs',
      title: 'Import Runs',
      description: 'Archive import runs, selected buckets, status, warnings, and summaries.',
      scope,
      query: defineNodeQueryAST(SocialImportRunSchema, {
        orderBy: { startedAt: 'desc', completedAt: 'desc' },
        page: page(options)
      })
    })
  ]
}
