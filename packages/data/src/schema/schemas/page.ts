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
import { text, file } from '../properties'

export const PageSchema = defineSchema({
  name: 'Page',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Page title */
    title: text({ required: true, maxLength: 500 }),

    /** Emoji or icon URL */
    icon: text({}),

    /** Cover image */
    cover: file({ accept: ['image/*'] })
  },
  document: 'yjs' // Collaborative Y.Doc for rich text
})

/**
 * A Page node type (inferred from schema).
 */
export type Page = InferNode<(typeof PageSchema)['_properties']>
