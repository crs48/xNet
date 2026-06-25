/**
 * Spaces seeder — the foundation. Builds the workspace tree (an org Space with
 * nested team sub-spaces + a personal Space), per-space memberships (author is
 * owner everywhere; demo people get varied roles), a NESTED folder tree, the
 * shared tag palette, and Profiles for the demo people.
 *
 * Local writes aren't authz-gated (the hub is the enforcement point), so nodes
 * can reference any space/folder regardless of import order.
 */

import type { SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import {
  FolderSchema,
  ProfileSchema,
  SpaceMembershipSchema,
  SpaceSchema,
  TagSchema
} from '@xnetjs/data'
import { FOLDER_TREE, SPACE_IDS, TAG_PALETTE, TEAM_SPACES, folderPath, tagId } from '../fixtures'
import { seedId } from '../seed-ids'

const folderParent = (path: string): string | undefined =>
  path.includes('/') ? folderPath(path.slice(0, path.lastIndexOf('/'))) : undefined

export const spacesSeeder: SeederModule = {
  domain: 'spaces',
  label: 'Workspace & people',
  schemaIds: [
    SpaceSchema._schemaId,
    SpaceMembershipSchema._schemaId,
    FolderSchema._schemaId,
    TagSchema._schemaId,
    ProfileSchema._schemaId
  ],
  seed: ({ authorDID, people }) => {
    const drafts: DeterministicNodeImportDraft[] = []

    // ─── Space tree: org → teams, plus a personal space ──────────────────
    drafts.push({
      id: SPACE_IDS.org,
      schemaId: SpaceSchema._schemaId,
      properties: {
        name: 'Acme Inc',
        kind: 'organization',
        visibility: 'private',
        owners: [authorDID],
        description: 'Seeded demo workspace — every content type, deeply interrelated.',
        icon: '🏢',
        color: 'blue'
      }
    })
    for (const team of TEAM_SPACES) {
      drafts.push({
        id: team.id,
        schemaId: SpaceSchema._schemaId,
        properties: {
          name: team.name,
          kind: 'team',
          visibility: 'private',
          owners: [authorDID],
          parent: SPACE_IDS.org,
          icon: team.icon
        }
      })
    }
    drafts.push({
      id: SPACE_IDS.personal,
      schemaId: SpaceSchema._schemaId,
      properties: {
        name: 'Personal',
        kind: 'personal',
        visibility: 'private',
        owners: [authorDID],
        icon: '🏠'
      }
    })

    const allSpaceIds = [SPACE_IDS.org, ...TEAM_SPACES.map((t) => t.id), SPACE_IDS.personal]

    // ─── Memberships: author owns every space ────────────────────────────
    for (const spaceId of allSpaceIds) {
      drafts.push({
        id: seedId('membership', spaceId, authorDID),
        schemaId: SpaceMembershipSchema._schemaId,
        properties: { space: spaceId, member: authorDID, role: 'owner' }
      })
    }

    // ─── Demo people: members of the org (+ some teams) + profiles ───────
    const roles = ['admin', 'member', 'commenter', 'viewer'] as const
    people.forEach((person, i) => {
      drafts.push({
        id: seedId('membership', SPACE_IDS.org, person.did),
        schemaId: SpaceMembershipSchema._schemaId,
        properties: { space: SPACE_IDS.org, member: person.did, role: roles[i % roles.length] }
      })
      // Spread people across team spaces too, for cross-space membership.
      const team = TEAM_SPACES[i % TEAM_SPACES.length]
      drafts.push({
        id: seedId('membership', team.id, person.did),
        schemaId: SpaceMembershipSchema._schemaId,
        properties: { space: team.id, member: person.did, role: 'member' }
      })
      drafts.push({
        id: seedId('profile', person.did),
        schemaId: ProfileSchema._schemaId,
        properties: {
          did: person.did,
          displayName: person.name,
          handle: person.name
            .toLowerCase()
            .replace(/[^a-z]+/g, '')
            .slice(0, 16),
          statusEmoji: person.emoji
        }
      })
    })

    // ─── Nested folder tree (depth ≥3) ──────────────────────────────────
    for (const folder of FOLDER_TREE) {
      drafts.push({
        id: folderPath(folder.path),
        schemaId: FolderSchema._schemaId,
        properties: { name: folder.name, icon: folder.icon, parent: folderParent(folder.path) }
      })
    }

    // ─── Shared tag palette ─────────────────────────────────────────────
    for (const tag of TAG_PALETTE) {
      drafts.push({
        id: tagId(tag.slug),
        schemaId: TagSchema._schemaId,
        properties: { name: tag.name, color: tag.color }
      })
    }

    return { drafts }
  }
}

// Back-compat re-exports for sibling seeders.
export { tagId } from '../fixtures'
export { folderPath as folderId } from '../fixtures'
