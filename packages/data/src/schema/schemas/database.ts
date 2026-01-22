/**
 * DatabaseSchema - A collection that defines a schema for its items.
 *
 * Databases are like Notion databases - they contain items (rows)
 * that all share the same property schema. The database itself
 * stores the schema definition.
 */

import { defineSchema } from '../define'
import { text, file, select } from '../properties'
import type { InferNode } from '../types'

export const DatabaseSchema = defineSchema({
  name: 'Database',
  namespace: 'xnet://xnet.dev/',
  properties: {
    /** Database title */
    title: text({ required: true, maxLength: 500 }),

    /** Emoji or icon URL */
    icon: text({}),

    /** Cover image */
    cover: file({ accept: ['image/*'] }),

    /** Default view type for this database */
    defaultView: select({
      options: [
        { id: 'table', name: 'Table' },
        { id: 'board', name: 'Board' },
        { id: 'list', name: 'List' },
        { id: 'gallery', name: 'Gallery' },
        { id: 'calendar', name: 'Calendar' },
        { id: 'timeline', name: 'Timeline' }
      ] as const,
      default: 'table'
    })

    // Note: The property schema for items is stored separately
    // in the database's schema definition, not as a property value.
  },
  // Y.Doc for storing rows, view configs, and other mutable state
  document: 'yjs'
})

/**
 * A Database node type (inferred from schema).
 */
export type Database = InferNode<(typeof DatabaseSchema)['_properties']>
