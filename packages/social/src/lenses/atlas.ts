/**
 * Graph atlas metadata for browsing starter social graph lenses.
 */

import type {
  SocialGraphLensEdgeRule,
  SocialGraphLensId,
  SocialGraphLensNodeRole,
  SocialGraphLensOptions,
  SocialGraphLensRelationshipKind
} from './graph-lenses'
import { createDefaultSocialGraphLenses } from './graph-lenses'

export type SocialGraphAtlasNodeRoleSummary = {
  queryId: string
  role: SocialGraphLensNodeRole
  schemaId: string
}

export type SocialGraphAtlasEntry = {
  id: SocialGraphLensId
  title: string
  description: string
  primaryQueryId: string
  queryCount: number
  nodeRoles: SocialGraphAtlasNodeRoleSummary[]
  edgeRules: SocialGraphLensEdgeRule[]
  relationshipKinds: SocialGraphLensRelationshipKind[]
}

function uniqueSorted<T extends string>(items: readonly T[]): T[] {
  return [...new Set(items)].sort()
}

export function createDefaultSocialGraphAtlas(
  options: SocialGraphLensOptions = {}
): SocialGraphAtlasEntry[] {
  return createDefaultSocialGraphLenses(options).map((lens) => {
    const nodeRoles = Object.entries(lens.queryRoles).map(([queryId, role]) => ({
      queryId,
      role: role.role,
      schemaId: role.schemaId
    }))

    return {
      id: lens.id,
      title: lens.title,
      description: lens.description,
      primaryQueryId: lens.primaryQueryId,
      queryCount: nodeRoles.length,
      nodeRoles,
      edgeRules: lens.edgeRules,
      relationshipKinds: uniqueSorted(lens.edgeRules.map((edge) => edge.relationshipKind))
    }
  })
}
