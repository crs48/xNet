/**
 * SpaceMembershipSchema - membership edge carrying a per-person role
 * (exploration 0179).
 *
 * A flat `members: person[]` list (as on `Channel`) cannot carry per-person
 * roles, so membership is a small edge node `{ space, member, role }` — the
 * same membership-edge pattern `SocialCollectionItem` uses. One membership per
 * (space, member); re-adds upsert by deterministic id (see
 * `spaceMembershipId`).
 */

import type { InferNode } from '../types'
import type { SpaceRole } from './space'
import { defineSchema } from '../define'
import { created, createdBy, number, person, relation, select } from '../properties'

export const SPACE_MEMBERSHIP_SCHEMA_IRI = 'xnet://xnet.fyi/SpaceMembership@1.0.0'

export const SpaceMembershipSchema = defineSchema({
  name: 'SpaceMembership',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** The space this membership belongs to */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const, required: true }),

    /** The member DID */
    member: person({ required: true }),

    /** Role within the space */
    role: select({
      options: [
        { id: 'viewer', name: 'Viewer', color: 'gray' },
        { id: 'commenter', name: 'Commenter', color: 'yellow' },
        { id: 'member', name: 'Member', color: 'blue' },
        { id: 'admin', name: 'Admin', color: 'purple' },
        { id: 'owner', name: 'Owner', color: 'red' }
      ] as const,
      required: true,
      default: 'member'
    }),

    /** Who added this member (DID) */
    addedBy: person({}),

    /** When the member was added (ms since epoch) */
    addedAt: number({}),

    /**
     * Optional expiry (ms since epoch) for time-boxed grants — e.g. sharing a
     * diagnostics Space with a support identity (exploration 0341). Absent =
     * permanent. Clients treat an expired membership as revoked and sweep the
     * edge node on sight.
     */
    expiresAt: number({}),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

export type SpaceMembership = InferNode<(typeof SpaceMembershipSchema)['_properties']>

/**
 * Deterministic membership node id so re-adding a member upserts instead of
 * duplicating (one membership per space+member). Stable, peer-independent.
 */
export function spaceMembershipId(spaceId: string, memberDid: string): string {
  return `spacemember:${spaceId}:${memberDid}`
}

/** Narrow an arbitrary value to a known SpaceRole. */
export function isSpaceRole(value: unknown): value is SpaceRole {
  return (
    value === 'viewer' ||
    value === 'commenter' ||
    value === 'member' ||
    value === 'admin' ||
    value === 'owner'
  )
}
