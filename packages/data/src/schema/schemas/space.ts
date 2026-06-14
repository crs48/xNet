/**
 * SpaceSchema - the unifying group primitive (exploration 0179).
 *
 * A Space is a SECURITY BOUNDARY: a named container of people + content with
 * roles. `kind` only selects presets (labels / icon / policy) — the structure
 * is identical across kinds (cf. `Channel.kind`). Containment is a
 * single-valued `space` relation on the CHILD (the security home); `Folder`
 * remains structure WITHIN a space. Membership + per-person roles live on
 * `SpaceMembership` edges. Spaces nest via `parent`; members inherit down.
 *
 * Enforcement rides the existing hub grant index: a membership becomes a
 * container grant (`resource = spaceId`, subtree scope), so writes/reads to
 * any node whose space (or an ancestor space) the DID holds a grant on are
 * allowed. Schemas therefore carry no `authorization` block — like
 * `Folder`/`Channel`/`Project`, the hub is the enforcement point.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { checkbox, created, createdBy, person, relation, select, text } from '../properties'
import {
  buildFolderTree,
  flattenFolderTree,
  folderAncestorIds,
  folderPathIds,
  wouldCreateFolderCycle,
  type FolderLike,
  type FolderTreeNode
} from './folder'
import { spaceOwnAuthorization } from './space-authorization'

export const SPACE_SCHEMA_IRI = 'xnet://xnet.fyi/Space@1.0.0'

/**
 * Space flavors. They differ only in presets, never in structure. These are the
 * genuine *people-containers*; `project` is intentionally NOT a kind — a Project
 * is a work-grouping ([[ProjectSchema]]) that lives inside a Space, not a
 * security boundary of its own (exploration 0181).
 */
export const SPACE_KINDS = [
  'personal',
  'workspace',
  'organization',
  'team',
  'community',
  'family'
] as const
export type SpaceKind = (typeof SPACE_KINDS)[number]

/** Space-level visibility: the private→public dial (exploration 0179). */
export const SPACE_VISIBILITY = ['private', 'unlisted', 'public'] as const
export type SpaceVisibility = (typeof SPACE_VISIBILITY)[number]

/**
 * Per-node visibility. `inherit` (default) defers to the node's Space; the
 * other values are explicit, and per the expansive rule may only *raise*
 * access above the space, never lower it.
 */
export const NODE_VISIBILITY = ['inherit', 'private', 'unlisted', 'public'] as const
export type NodeVisibility = (typeof NODE_VISIBILITY)[number]

export const SpaceSchema = defineSchema({
  name: 'Space',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Space display name */
    name: text({ required: true, maxLength: 200 }),

    /** Flavor — selects presets only */
    kind: select({
      options: [
        { id: 'personal', name: 'Personal', color: 'gray' },
        { id: 'workspace', name: 'Workspace', color: 'blue' },
        { id: 'organization', name: 'Organization', color: 'purple' },
        { id: 'team', name: 'Team', color: 'green' },
        { id: 'community', name: 'Community', color: 'pink' },
        { id: 'family', name: 'Family', color: 'red' }
      ] as const,
      required: true,
      default: 'workspace'
    }),

    /** Nesting parent; empty = top-level (exploration 0179) */
    parent: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Private by default; unlisted via links; public is a deliberate escalation */
    visibility: select({
      options: [
        { id: 'private', name: 'Private', color: 'gray' },
        { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
        { id: 'public', name: 'Public', color: 'green' }
      ] as const,
      required: true,
      default: 'private'
    }),

    /** Governance set — the admin/owner DIDs (no group DID needed in v1) */
    owners: person({ multiple: true }),

    /** Short description / purpose */
    description: text({ maxLength: 2000 }),

    /** Emoji or icon URL */
    icon: text({ maxLength: 500 }),

    /** Accent color */
    color: text({ maxLength: 30 }),

    /** Order among siblings — fractional index, code-unit compare */
    sortKey: text({ maxLength: 500 }),

    /** Archived spaces are hidden from the default list */
    archived: checkbox({ default: false }),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  // Members resolve from SpaceMembership edges and cascade down the `parent`
  // chain (exploration 0181). Content inherits these via `role.relation`.
  authorization: spaceOwnAuthorization()
})

export type Space = InferNode<(typeof SpaceSchema)['_properties']>

// ─── Roles ───────────────────────────────────────────────────────────────────

/** Space roles, least → most privileged. */
export const SPACE_ROLES = ['viewer', 'commenter', 'member', 'admin', 'owner'] as const
export type SpaceRole = (typeof SPACE_ROLES)[number]

const SPACE_ROLE_RANK: Record<SpaceRole, number> = {
  viewer: 0,
  commenter: 1,
  member: 2,
  admin: 3,
  owner: 4
}

/** Negative when `a` is less privileged than `b`. */
export const compareSpaceRoles = (a: SpaceRole, b: SpaceRole): number =>
  SPACE_ROLE_RANK[a] - SPACE_ROLE_RANK[b]

/** Most-permissive-wins across a member's roles (e.g. nested memberships). */
export function effectiveSpaceRole(roles: readonly SpaceRole[]): SpaceRole | null {
  let best: SpaceRole | null = null
  for (const role of roles) {
    if (!best || compareSpaceRoles(role, best) > 0) best = role
  }
  return best
}

/** Whether a role may manage members, links, and settings. */
export const canManageSpace = (role: SpaceRole): boolean => role === 'admin' || role === 'owner'

/**
 * Grant actions a Space role maps to for the hub grant index. Mirrors the
 * share-link role → actions mapping (`SHARE_ROLE_ACTIONS`) and extends it with
 * `admin`/`share` for the managing roles.
 */
export function spaceRoleGrantActions(role: SpaceRole): string[] {
  switch (role) {
    case 'viewer':
      return ['read']
    case 'commenter':
      return ['read', 'comment']
    case 'member':
      return ['read', 'comment', 'write']
    case 'admin':
    case 'owner':
      return ['read', 'comment', 'write', 'share', 'admin']
  }
}

/** Coarse share-link role (read/comment/write) for a space role. */
export function spaceRoleToShareRole(role: SpaceRole): 'read' | 'comment' | 'write' {
  if (role === 'viewer') return 'read'
  if (role === 'commenter') return 'comment'
  return 'write'
}

// ─── Tree helpers (Spaces nest via `parent`, exactly like Folders) ────────────

export type SpaceLike = FolderLike
export type SpaceTreeNode<S extends SpaceLike = SpaceLike> = FolderTreeNode<S>

export const buildSpaceTree = buildFolderTree
export const flattenSpaceTree = flattenFolderTree
export const spaceAncestorIds = folderAncestorIds
export const spacePathIds = folderPathIds
export const wouldCreateSpaceCycle = wouldCreateFolderCycle
