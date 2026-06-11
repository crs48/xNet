/**
 * DatabaseSchema - A collection that defines a schema for its items.
 *
 * Databases are like Notion databases - they contain items (rows)
 * that all share the same field schema.
 *
 * V2 data model ("everything is a node"):
 * - Fields are DatabaseField nodes (ordering via fractional sortKey)
 * - Select options are DatabaseSelectOption nodes
 * - Views are DatabaseView nodes
 * - Rows are DatabaseRow nodes with per-cell LWW dynamic properties
 *
 * The database's Y.Doc carries NO persistent state — it exists solely as
 * the awareness channel for live presence (cell focus, edit indicators,
 * range selections).
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, file, select, number } from '../properties'

export const DatabaseSchema = defineSchema({
  name: 'Database',
  namespace: 'xnet://xnet.fyi/',
  version: '2.0.0',
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
    rowCount: number({ min: 0, integer: true }),

    /**
     * Version of the database-defined schema (semver).
     * Bumped when fields change (see schema-utils.ts bump rules).
     * Used to build the database schema IRI: xnet://xnet.fyi/db/<id>@<version>
     */
    schemaVersion: text({ maxLength: 20 })
  },
  // Y.Doc used ONLY as the awareness/presence channel — no persistent state
  document: 'yjs'
})

/**
 * A Database node type (inferred from schema).
 */
export type Database = InferNode<(typeof DatabaseSchema)['_properties']>
