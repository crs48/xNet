/**
 * DatabaseViewSchema - A saved view configuration for a database.
 *
 * V2 data model: views are first-class nodes (not Y.Doc entries). Filter
 * trees, sort lists, and per-view layout overrides are whole-value LWW
 * json properties — each is an intentional unit (a filter tree edited in
 * the filter builder commits atomically), while distinct concerns (filters
 * vs sorts vs field widths) merge independently because they are separate
 * properties.
 *
 * Per-view layout overrides (fieldOrder/fieldWidths/hiddenFields) layer on
 * top of the DatabaseField defaults, giving Notion-style per-view
 * reorder/resize/hide without duplicating the schema.
 */

import type { FilterGroup, SortConfig } from '../../database/view-types'
import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, relation, select, json } from '../properties'

export const DatabaseViewSchema = defineSchema({
  name: 'DatabaseView',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Parent database */
    database: relation({
      target: 'xnet://xnet.fyi/Database@2.0.0',
      required: true
    }),

    /** Display name */
    name: text({ required: true, maxLength: 200 }),

    /** View type */
    type: select({
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

    /** Filter tree (FilterGroup) — whole-tree LWW */
    filters: json<FilterGroup>({}),

    /** Sort list (SortConfig[]) — whole-list LWW */
    sorts: json<SortConfig[]>({}),

    /** Group-by field ID */
    groupBy: text({ maxLength: 100 }),

    /** Group sort direction ('asc' | 'desc') */
    groupSort: text({ maxLength: 4 }),

    /** Collapsed group keys */
    collapsedGroups: json<string[]>({}),

    /** Per-view field order: fieldId -> fractional sortKey override */
    fieldOrder: json<Record<string, string>>({}),

    /** Per-view field widths: fieldId -> pixels */
    fieldWidths: json<Record<string, number>>({}),

    /** Per-view hidden field IDs */
    hiddenFields: json<string[]>({}),

    /** Fractional index for view tab ordering */
    sortKey: text({ required: true }),

    // Gallery/Board specific
    /** Cover image field ID */
    coverField: text({ maxLength: 100 }),

    /** Card size ('small' | 'medium' | 'large') */
    cardSize: text({ maxLength: 10 }),

    // Calendar/Timeline specific
    /** Start date field ID */
    dateField: text({ maxLength: 100 }),

    /** End date field ID */
    endDateField: text({ maxLength: 100 })
  }
})

/**
 * A DatabaseView node type (inferred from schema).
 */
export type DatabaseView = InferNode<(typeof DatabaseViewSchema)['_properties']>
