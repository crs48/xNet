/**
 * DatabaseSchema - A collection that defines a schema for its items.
 *
 * Databases are like Notion databases - they contain items (rows)
 * that all share the same property schema. The database itself
 * stores the schema definition.
 *
 * The Y.Doc stores:
 * - Column definitions (Y.Array<ColumnDefinition>)
 * - View configurations (Y.Map<ViewConfig>)
 * - Other collaborative state
 *
 * Rows are stored as separate DatabaseRow nodes for per-cell LWW.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, file, select, number } from '../properties'

export const DatabaseSchema = defineSchema({
  name: 'Database',
  namespace: 'xnet://xnet.fyi/',
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
    }),

    /**
     * Cached row count for this database.
     * Updated on row add/delete operations.
     * Used for query routing decisions (local vs hub).
     */
    rowCount: number({ min: 0, integer: true })
  },
  // Y.Doc for storing columns, views, and other collaborative state
  document: 'yjs'
})

/**
 * A Database node type (inferred from schema).
 */
export type Database = InferNode<(typeof DatabaseSchema)['_properties']>
