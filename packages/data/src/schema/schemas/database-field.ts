/**
 * DatabaseFieldSchema - A column definition for a database.
 *
 * V2 data model: fields are first-class nodes (not Y.Doc entries). This
 * gives them per-property LWW conflict resolution, queryability through
 * the standard NodeStore/SQLite path, and ordering via the same fractional
 * indexing scheme rows use.
 *
 * Field order is the `sortKey` fractional index. Views may override order,
 * width, and visibility per-view (see DatabaseViewSchema); the values here
 * are the database-level defaults.
 *
 * The `type` string is one of the FieldType union (see
 * packages/data/src/database/field-types.ts) and is enforced by the
 * field-operations layer rather than the schema system, so new field types
 * can be added without a schema version bump.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, relation, number, checkbox, json } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const DatabaseFieldSchema = defineSchema({
  name: 'DatabaseField',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Parent database */
    database: relation({
      target: 'xnet://xnet.fyi/Database@2.0.0',
      required: true
    }),

    /** Display name */
    name: text({ required: true, maxLength: 200 }),

    /** Field type (FieldType union, enforced in field-operations) */
    type: text({ required: true, maxLength: 50 }),

    /**
     * Type-specific configuration (FieldConfig).
     * Note: select/multiSelect options are NOT stored here — they are
     * separate DatabaseSelectOption nodes so concurrent option creation
     * merges cleanly.
     */
    config: json<Record<string, unknown>>({}),

    /** Fractional index for default column ordering */
    sortKey: text({ required: true }),

    /** Default column width in pixels (table views) */
    width: number({ min: 40, integer: true }),

    /** Whether this is the title field (exactly one per database) */
    isTitle: checkbox({}),

    /** Hidden by default (views can override) */
    hidden: checkbox({})
  },
  // Inherits access from its home Space (exploration 0181/0192).
  authorization: spaceCascadeAuthorization('database')
})

/**
 * A DatabaseField node type (inferred from schema).
 */
export type DatabaseField = InferNode<(typeof DatabaseFieldSchema)['_properties']>
