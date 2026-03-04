/**
 * Authorization presets - common authorization patterns as reusable factories.
 *
 * @example
 * ```typescript
 * import { presets } from '@xnetjs/data/auth'
 *
 * const NoteSchema = defineSchema({
 *   name: 'Note',
 *   namespace: 'xnet://myapp/',
 *   properties: { ... },
 *   authorization: presets.private()
 * })
 *
 * const PublicArticleSchema = defineSchema({
 *   name: 'Article',
 *   namespace: 'xnet://myapp/',
 *   properties: { ... },
 *   authorization: presets.publicRead()
 * })
 * ```
 */

import type { AuthorizationDefinition } from '@xnetjs/core'
import { allow, PUBLIC, AUTHENTICATED, role } from './builders'

/**
 * Authorization presets for common patterns.
 */
export const presets = {
  /**
   * Private - only the creator can access.
   *
   * Use for personal notes, private documents, etc.
   */
  private: (): AuthorizationDefinition => ({
    roles: {
      owner: role.creator()
    },
    actions: {
      read: allow('owner'),
      write: allow('owner'),
      delete: allow('owner'),
      share: allow('owner')
    }
  }),

  /**
   * Public read - anyone can read, only creator can write.
   *
   * Use for published content, blog posts, etc.
   */
  publicRead: (): AuthorizationDefinition => ({
    roles: {
      owner: role.creator()
    },
    actions: {
      read: PUBLIC,
      write: allow('owner'),
      delete: allow('owner'),
      share: allow('owner')
    }
  }),

  /**
   * Collaborative - roles inherited from a parent relation.
   *
   * Use for items within a workspace/project that inherits permissions.
   *
   * @param parentRelation - Name of the relation property to the parent node
   */
  collaborative: (parentRelation: string): AuthorizationDefinition => ({
    roles: {
      owner: role.creator(),
      admin: role.relation(parentRelation, 'admin'),
      editor: role.relation(parentRelation, 'editor'),
      viewer: role.relation(parentRelation, 'viewer')
    },
    actions: {
      read: allow('viewer', 'editor', 'admin', 'owner'),
      write: allow('editor', 'admin', 'owner'),
      delete: allow('admin', 'owner'),
      share: allow('admin', 'owner')
    }
  }),

  /**
   * Open - any authenticated user can read/write, only creator can delete.
   *
   * Use for wiki-style collaborative content.
   */
  open: (): AuthorizationDefinition => ({
    roles: {
      owner: role.creator()
    },
    actions: {
      read: AUTHENTICATED,
      write: AUTHENTICATED,
      delete: allow('owner'),
      share: allow('owner')
    }
  }),

  /**
   * Team-based - permissions based on a team/editors property.
   *
   * @param editorsProperty - Name of the person[] property containing editors
   */
  team: (editorsProperty: string): AuthorizationDefinition => ({
    roles: {
      owner: role.creator(),
      editor: role.property(editorsProperty)
    },
    actions: {
      read: allow('editor', 'owner'),
      write: allow('editor', 'owner'),
      delete: allow('owner'),
      share: allow('owner')
    }
  })
}
