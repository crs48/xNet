/**
 * PageSchema - Rich text document with collaborative editing.
 *
 * Pages are the primary content type in xNet. They support:
 * - Rich text content (via Yjs CRDT)
 * - Nested child pages
 * - Icons and cover images
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, file, relation, select, date, json } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const PageSchema = defineSchema({
  name: 'Page',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Page title */
    title: text({ required: true, maxLength: 500 }),

    /** Emoji or icon URL */
    icon: text({}),

    /** Cover image */
    cover: file({ accept: ['image/*'] }),

    /** Canonical home; empty = Unfiled (exploration 0169) */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Order among folder siblings — fractional index */
    sortKey: text({ maxLength: 500 }),

    /** Workspace-wide labels, referenced by id (exploration 0169) */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),

    /** Canonical SECURITY home; empty = personal/private (exploration 0179) */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Per-node visibility; `inherit` defers to the Space (exploration 0179) */
    visibility: select({
      options: [
        { id: 'inherit', name: 'Inherit', color: 'gray' },
        { id: 'private', name: 'Private', color: 'gray' },
        { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
        { id: 'public', name: 'Public', color: 'green' }
      ] as const,
      default: 'inherit'
    }),

    /**
     * Page geometry (exploration 0346): how the page's frame children
     * arrange — a linear stack (document, default), a tiled grid
     * (dashboard-style), or free space (canvas-style). A view property:
     * toggling never converts the frames themselves.
     */
    geometry: select({
      options: [
        { id: 'stack', name: 'Stack', color: 'gray' },
        { id: 'grid', name: 'Grid', color: 'blue' },
        { id: 'space', name: 'Space', color: 'purple' }
      ] as const,
      default: 'stack'
    }),

    // ─── Publishing (exploration 0362) ──────────────────────────────────────
    // A post is a Page with editorial metadata, not a separate document type:
    // publishing is a lens over the page substrate (0346), not a fork of it.

    /** Publication this page is a post in; empty = not a post */
    publication: relation({ target: 'xnet://xnet.fyi/Publication@1.0.0' as const }),

    /** URL segment, unique within the publication. Empty = never published */
    slug: text({ maxLength: 80 }),

    /** Feed/meta description. Falls back to a generated excerpt when empty */
    excerpt: text({ maxLength: 1000 }),

    /**
     * First publication time. **Absence is what makes a post a draft** — it is
     * the single source of truth for public visibility in feeds and sitemaps.
     */
    publishedAt: date({}),

    /** Set when first published elsewhere, so search engines credit the original */
    canonicalUrl: text({ maxLength: 500 }),

    /**
     * The published version: a frontier (`Record<NodeId, ChangeHash>`) pinned
     * at publish time (exploration 0329). Editing the live page does not
     * change what readers see until it is re-published.
     *
     * A pinned frontier is a pin: log pruning must respect it (0329's rule).
     */
    publishedFrontier: json({})
  },
  document: 'yjs', // Collaborative Y.Doc for rich text
  // Inherits access from its home Space (exploration 0181/0192).
  authorization: spaceCascadeAuthorization()
})

/**
 * A Page node type (inferred from schema).
 */
export type Page = InferNode<(typeof PageSchema)['_properties']>
