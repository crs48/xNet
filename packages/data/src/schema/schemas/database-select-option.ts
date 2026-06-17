/**
 * DatabaseSelectOptionSchema - One option of a select/multiSelect field.
 *
 * Options are first-class nodes (not entries in the field config) so that
 * "type a new tag and it's created" merges cleanly when two collaborators
 * do it concurrently: two creates are two nodes — no array conflict.
 * Rename/recolor is per-property LWW on the option node.
 *
 * Select cells store option node IDs (string for select, string[] for
 * multiSelect).
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, relation } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const DatabaseSelectOptionSchema = defineSchema({
  name: 'DatabaseSelectOption',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Parent field (must be a select/multiSelect field) */
    field: relation({
      target: 'xnet://xnet.fyi/DatabaseField@1.0.0',
      required: true
    }),

    /**
     * Parent database (denormalized from the field) so all options for a
     * database load in a single indexed query.
     */
    database: relation({
      target: 'xnet://xnet.fyi/Database@2.0.0',
      required: true
    }),

    /** Display name (the tag text) */
    name: text({ required: true, maxLength: 100 }),

    /** Display color (SelectColor union; enforced in field-operations) */
    color: text({ maxLength: 20 }),

    /** Fractional index for option ordering in pickers */
    sortKey: text({ required: true })
  },
  // Inherits access from its home Space (exploration 0181/0192).
  authorization: spaceCascadeAuthorization('database')
})

/**
 * A DatabaseSelectOption node type (inferred from schema).
 */
export type DatabaseSelectOption = InferNode<(typeof DatabaseSelectOptionSchema)['_properties']>
