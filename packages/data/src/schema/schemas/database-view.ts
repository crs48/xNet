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

import type { FormFieldRule, FormViewConfig } from '../../database/form-types'
import type { SummaryFunction } from '../../database/summary-engine'
import type { FilterGroup, SortConfig } from '../../database/view-types'
import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, relation, select, json, checkbox } from '../properties'
import type { MapViewport } from './map'
import { spaceCascadeAuthorization } from './space-authorization'

/**
 * Per-group presentation override for grouped views (board stacks,
 * timeline swimlanes). Keyed by select option ID in `groupMeta`.
 */
export interface ViewGroupMeta {
  /** Manual stack order (fractional sortKey, code-unit collation) */
  sortKey?: string
  /** Hide this stack from the view */
  hidden?: boolean
}

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
        { id: 'timeline', name: 'Timeline' },
        { id: 'form', name: 'Form' },
        { id: 'map', name: 'Map' }
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

    /** Row-height density tier (RowHeight: short | medium | tall | extraTall) */
    rowHeight: text({ maxLength: 12 }),

    /** Per-column footer summary functions: fieldId -> SummaryFunction */
    columnSummaries: json<Record<string, SummaryFunction>>({}),

    /** Fractional index for view tab ordering */
    sortKey: text({ required: true }),

    // Gallery/Board specific
    /** Cover image field ID */
    coverField: text({ maxLength: 100 }),

    /** Card size ('small' | 'medium' | 'large') */
    cardSize: text({ maxLength: 10 }),

    /** Cover image fit ('cover' | 'contain') */
    coverFit: text({ maxLength: 10 }),

    /** Select field ID used to color cards/bars/pins */
    colorBy: text({ maxLength: 100 }),

    /**
     * Per-group presentation overrides keyed by select option ID (or
     * '__none__' for the null group): manual stack order + hidden stacks.
     * Collapse state lives in `collapsedGroups`.
     */
    groupMeta: json<Record<string, ViewGroupMeta>>({}),

    // Calendar/Timeline specific
    /** Start date field ID */
    dateField: text({ maxLength: 100 }),

    /** End date field ID */
    endDateField: text({ maxLength: 100 }),

    // Map specific (exploration 0337)
    /** Latitude field ID (number field) */
    latField: text({ maxLength: 100 }),

    /** Longitude field ID (number field) */
    lngField: text({ maxLength: 100 }),

    /** Persisted map camera (center + zoom) — whole-object LWW */
    mapViewport: json<MapViewport>({}),

    // Form specific (exploration 0278)
    /** Form question config (FormViewConfig) — whole-object LWW */
    formConfig: json<FormViewConfig>({}),

    /** Per-question show-if rules: fieldId -> FormFieldRule — whole-map LWW */
    formRules: json<Record<string, FormFieldRule>>({}),

    /** Accepting responses toggle (form view) */
    formAccepting: checkbox({ default: true })
  },
  // Inherits access from its home Space (exploration 0181/0192).
  authorization: spaceCascadeAuthorization('database')
})

/**
 * A DatabaseView node type (inferred from schema).
 */
export type DatabaseView = InferNode<(typeof DatabaseViewSchema)['_properties']>
