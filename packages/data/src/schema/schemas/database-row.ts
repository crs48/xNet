/**
 * DatabaseRowSchema - A row in a database.
 *
 * Every database row is a first-class Node in the NodeStore. This gives us:
 * - Per-row identity (nanoid, timestamps, author)
 * - Per-property LWW conflict resolution
 * - The ability to query rows using existing NodeStore infrastructure
 *
 * Cell values are stored as dynamic properties on the row node, keyed by
 * column ID with a `cell_` prefix. When Alice edits the "name" cell and
 * Bob edits the "status" cell concurrently, both edits merge cleanly
 * because they're different properties with independent Lamport timestamps.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, relation } from '../properties'

export const DatabaseRowSchema = defineSchema({
  name: 'DatabaseRow',
  namespace: 'xnet://xnet.fyi/',

  properties: {
    /**
     * Reference to the parent database.
     * This is a typed relation that only accepts Database node IDs.
     */
    database: relation({
      target: 'xnet://xnet.fyi/Database@1.0.0',
      required: true
    }),

    /**
     * Fractional index for row ordering.
     * Uses a string-based fractional indexing scheme (like Figma/Linear)
     * that allows inserting between any two rows without reindexing.
     *
     * @see packages/data/src/database/fractional-index.ts
     */
    sortKey: text({ required: true })
  },

  /**
   * Y.Doc for rich text cells.
   * Only created when the row has rich text columns.
   * Each rich text column gets its own Y.XmlFragment in the doc.
   */
  document: 'yjs'
})

/**
 * A DatabaseRow node type (inferred from schema).
 *
 * Note: Cell values are stored as dynamic properties with `cell_` prefix,
 * so they won't appear in this type. Use `fromCellProperties()` to extract
 * cell values from a row's properties.
 */
export type DatabaseRow = InferNode<(typeof DatabaseRowSchema)['_properties']>
