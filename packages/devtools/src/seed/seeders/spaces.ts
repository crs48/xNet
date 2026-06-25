/**
 * Spaces seeder — the foundation. Emits the demo Space (owned by the real
 * author so cascade authz grants access), per-person memberships, a couple of
 * Folders, a Tag palette, and Profiles for the demo people.
 */

import { FolderSchema, ProfileSchema, SpaceMembershipSchema, SpaceSchema, TagSchema } from '@xnetjs/data'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import type { SeederModule } from '../types'
import { seedId } from '../seed-ids'

export const TAG_PALETTE = [
  { slug: 'backend', name: 'backend', color: 'blue' },
  { slug: 'frontend', name: 'frontend', color: 'green' },
  { slug: 'urgent', name: 'urgent', color: 'red' },
  { slug: 'design', name: 'design', color: 'purple' },
  { slug: 'docs', name: 'docs', color: 'gray' }
] as const

export const FOLDERS = [
  { slug: 'work', name: 'Work', icon: '💼' },
  { slug: 'notes', name: 'Notes', icon: '🗒️' }
] as const

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
  seed: ({ space, authorDID, people }) => {
    const drafts: DeterministicNodeImportDraft[] = [
      {
        id: space,
        schemaId: SpaceSchema._schemaId,
        properties: {
          name: 'Demo Workspace',
          kind: 'workspace',
          visibility: 'private',
          owners: [authorDID],
          description: 'Seeded demo data — projects, docs, channels, metrics and more.',
          icon: '🚀',
          color: 'blue'
        }
      },
      // Author owns the space (this is what grants in-app authz).
      {
        id: seedId('membership', authorDID),
        schemaId: SpaceMembershipSchema._schemaId,
        properties: { space, member: authorDID, role: 'owner' }
      }
    ]

    // Demo people as members (display only — they have no real keys).
    const roles = ['admin', 'member', 'commenter', 'viewer'] as const
    people.forEach((person, i) => {
      drafts.push({
        id: seedId('membership', person.did),
        schemaId: SpaceMembershipSchema._schemaId,
        properties: { space, member: person.did, role: roles[i % roles.length] }
      })
      drafts.push({
        id: seedId('profile', person.did),
        schemaId: ProfileSchema._schemaId,
        properties: {
          did: person.did,
          displayName: person.name,
          handle: person.name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 16),
          statusEmoji: person.emoji
        }
      })
    })

    for (const folder of FOLDERS) {
      drafts.push({
        id: seedId('folder', folder.slug),
        schemaId: FolderSchema._schemaId,
        properties: { name: folder.name, icon: folder.icon }
      })
    }

    for (const tag of TAG_PALETTE) {
      drafts.push({
        id: seedId('tag', tag.slug),
        schemaId: TagSchema._schemaId,
        properties: { name: tag.name, color: tag.color }
      })
    }

    return { drafts }
  }
}

/** Tag node IDs other seeders reference. */
export const tagId = (slug: string): string => seedId('tag', slug)
/** Folder node IDs other seeders reference. */
export const folderId = (slug: string): string => seedId('folder', slug)
