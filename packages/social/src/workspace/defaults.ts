/**
 * Default workspace seeds for imported social graph data.
 */

import type { SocialFeedViewDefinition, SocialFeedViewId } from '../feeds'
import type { SocialGraphLensDefinition, SocialGraphLensId } from '../lenses'
import type { SocialSavedViewDefinition, SocialSavedViewId, SocialSavedViewScope } from '../views'
import type { SavedViewDescriptor } from '@xnetjs/data'
import { createDefaultSocialFeedViews } from '../feeds'
import { createSocialNodeId } from '../import/ids'
import { createDefaultSocialGraphLenses } from '../lenses'
import { createDefaultSocialSavedViews } from '../views'

export type SocialWorkspaceSeedKind = 'schema-view' | 'graph-lens' | 'feed-view'

export type SocialWorkspaceSeedPresentation =
  | 'table'
  | 'facet-browser'
  | 'timeline'
  | 'graph'
  | 'canvas'
  | 'feed'

export type SocialWorkspaceSavedViewSeed = {
  id: SocialSavedViewId | SocialGraphLensId | SocialFeedViewId
  deterministicId: string
  seedKind: SocialWorkspaceSeedKind
  title: string
  description: string
  descriptor: SavedViewDescriptor
  descriptorJson: string
  scope: SocialSavedViewScope
  presentationModes: SocialWorkspaceSeedPresentation[]
  savedViewProperties: {
    title: string
    description: string
    descriptor: string
    scope: SocialSavedViewScope
  }
}

export type SocialWorkspaceSeedOptions = {
  workspaceId?: string
  scope?: SocialSavedViewScope
  pageSize?: number
}

const DEFAULT_SOCIAL_WORKSPACE_ID = 'social-data-workspace'

function createSeedId(input: {
  workspaceId: string
  seedKind: SocialWorkspaceSeedKind
  sourceId: string
}): string {
  return createSocialNodeId('workspace-saved-view', [
    input.workspaceId,
    input.seedKind,
    input.sourceId
  ])
}

function descriptorJson(descriptor: SavedViewDescriptor): string {
  return JSON.stringify(descriptor)
}

function schemaViewSeed(input: {
  workspaceId: string
  view: SocialSavedViewDefinition
}): SocialWorkspaceSavedViewSeed {
  const descriptor = input.view.descriptor
  const json = descriptorJson(descriptor)

  return {
    id: input.view.id,
    deterministicId: createSeedId({
      workspaceId: input.workspaceId,
      seedKind: 'schema-view',
      sourceId: input.view.id
    }),
    seedKind: 'schema-view',
    title: input.view.title,
    description: input.view.description,
    descriptor,
    descriptorJson: json,
    scope: input.view.savedViewProperties.scope,
    presentationModes: ['table', 'facet-browser', 'timeline', 'canvas'],
    savedViewProperties: {
      title: input.view.title,
      description: input.view.description,
      descriptor: json,
      scope: input.view.savedViewProperties.scope
    }
  }
}

function graphLensSeed(input: {
  workspaceId: string
  scope: SocialSavedViewScope
  lens: SocialGraphLensDefinition
}): SocialWorkspaceSavedViewSeed {
  const descriptor = input.lens.descriptor
  const json = descriptorJson(descriptor)

  return {
    id: input.lens.id,
    deterministicId: createSeedId({
      workspaceId: input.workspaceId,
      seedKind: 'graph-lens',
      sourceId: input.lens.id
    }),
    seedKind: 'graph-lens',
    title: input.lens.title,
    description: input.lens.description,
    descriptor,
    descriptorJson: json,
    scope: input.scope,
    presentationModes: ['graph', 'canvas', 'table', 'facet-browser'],
    savedViewProperties: {
      title: input.lens.title,
      description: input.lens.description,
      descriptor: json,
      scope: input.scope
    }
  }
}

function feedViewSeed(input: {
  workspaceId: string
  view: SocialFeedViewDefinition
}): SocialWorkspaceSavedViewSeed {
  const descriptor = input.view.descriptor
  const json = descriptorJson(descriptor)

  return {
    id: input.view.id,
    deterministicId: createSeedId({
      workspaceId: input.workspaceId,
      seedKind: 'feed-view',
      sourceId: input.view.id
    }),
    seedKind: 'feed-view',
    title: input.view.title,
    description: input.view.description,
    descriptor,
    descriptorJson: json,
    scope: input.view.savedViewProperties.scope,
    presentationModes: ['feed', 'table', 'facet-browser', 'timeline'],
    savedViewProperties: {
      title: input.view.title,
      description: input.view.description,
      descriptor: json,
      scope: input.view.savedViewProperties.scope
    }
  }
}

/**
 * Create deterministic SavedView seeds for the default imported social data workspace.
 */
export function createDefaultSocialWorkspaceSavedViewSeeds(
  options: SocialWorkspaceSeedOptions = {}
): SocialWorkspaceSavedViewSeed[] {
  const workspaceId = options.workspaceId ?? DEFAULT_SOCIAL_WORKSPACE_ID
  const scope = options.scope ?? 'workspace'
  const savedViews = createDefaultSocialSavedViews({
    scope,
    pageSize: options.pageSize
  }).map((view) => schemaViewSeed({ workspaceId, view }))
  const feedViews = createDefaultSocialFeedViews({
    scope,
    pageSize: options.pageSize
  }).map((view) => feedViewSeed({ workspaceId, view }))
  const graphLenses = createDefaultSocialGraphLenses({
    scope,
    pageSize: options.pageSize
  }).map((lens) => graphLensSeed({ workspaceId, scope, lens }))

  return [...savedViews, ...feedViews, ...graphLenses]
}

export function getDefaultSocialWorkspaceId(): string {
  return DEFAULT_SOCIAL_WORKSPACE_ID
}
