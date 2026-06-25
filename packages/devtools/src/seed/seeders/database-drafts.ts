/**
 * Deterministic builder for a fully-populated Database v2.
 *
 * Database v2 stores columns, choices, rows and views as first-class NodeStore
 * nodes (NOT in the Yjs doc): `DatabaseField`, `DatabaseSelectOption`,
 * `DatabaseRow` (cells live in `cell_<fieldId>` props), `DatabaseView`. This
 * turns a compact spec into deterministic drafts so seeded databases render
 * filled-out and converge on re-run.
 *
 * Cell conventions (differ from schema field formats):
 *  - date  → ISO string ('2024-06-15')      (NOT epoch ms)
 *  - select → option node id
 *  - multiSelect → option node id[]
 *  - relation → related DatabaseRow node id[]
 *  - person → DID; file → { cid, name, mimeType, size }
 */

import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import {
  DatabaseFieldSchema,
  DatabaseRowSchema,
  DatabaseSchema,
  DatabaseSelectOptionSchema,
  DatabaseViewSchema
} from '@xnetjs/data'
import { seedId } from '../seed-ids'

/** Lexicographic, deterministic sibling-ordering key. */
export const sortKey = (i: number): string => `a${String(i).padStart(7, '0')}`

export interface FieldSpec {
  /** Stable local key → field id. */
  key: string
  name: string
  type: string
  isTitle?: boolean
  width?: number
  /** For select/multiSelect: choices (key → option node id). */
  options?: ReadonlyArray<{ key: string; name: string; color: string }>
  config?: Record<string, unknown>
}

/** A filter condition referencing a field by its local key. */
export interface FilterSpec {
  key: string
  operator:
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'isEmpty'
    | 'isNotEmpty'
    | 'greaterThan'
    | 'lessThan'
    | 'before'
    | 'after'
  value?: unknown
}

export interface ViewSpec {
  slug: string
  name: string
  type: 'table' | 'board' | 'list' | 'gallery' | 'calendar' | 'timeline'
  /** Field key to group by (board). */
  groupByKey?: string
  /** Date field key (calendar/timeline). */
  dateKey?: string
  /** End-date field key (timeline). */
  endDateKey?: string
  /** Cover image field key (gallery). */
  coverKey?: string
  cardSize?: 'small' | 'medium' | 'large'
  rowHeight?: 'short' | 'medium' | 'tall'
  /** AND-combined filter conditions (keys translated to field ids). */
  filters?: FilterSpec[]
  /** Sort by field key. */
  sorts?: Array<{ key: string; direction: 'asc' | 'desc' }>
  /** Field key → footer summary function. */
  summaries?: Record<string, string>
  /** Field keys hidden in this view. */
  hiddenKeys?: string[]
}

export interface DatabaseSpec {
  slug: string
  title: string
  icon: string
  space: string
  folder?: string
  tags?: string[]
  defaultView?: string
  fields: FieldSpec[]
  /** Each row keyed by FieldSpec.key. select/multiSelect values are option keys. */
  rows: Array<Record<string, unknown>>
  views: ViewSpec[]
}

export const databaseId = (slug: string): string => seedId('database', slug)
export const dbFieldId = (slug: string, key: string): string => seedId('dbfield', slug, key)
export const dbRowId = (slug: string, i: number): string => seedId('dbrow', slug, i)
const dbOptionId = (slug: string, fieldKey: string, optKey: string): string =>
  seedId('dboption', slug, fieldKey, optKey)

/** Build every node draft for one fully-populated database. */
export function databaseDrafts(spec: DatabaseSpec): DeterministicNodeImportDraft[] {
  const dbId = databaseId(spec.slug)
  const fieldId = (key: string) => dbFieldId(spec.slug, key)
  const optionId = (fieldKey: string, optKey: string) => dbOptionId(spec.slug, fieldKey, optKey)

  const drafts: DeterministicNodeImportDraft[] = [
    {
      id: dbId,
      schemaId: DatabaseSchema._schemaId,
      properties: {
        title: spec.title,
        icon: spec.icon,
        defaultView: spec.defaultView ?? 'table',
        space: spec.space,
        folder: spec.folder,
        tags: spec.tags
      }
    }
  ]

  // Fields + their select options.
  spec.fields.forEach((field, i) => {
    drafts.push({
      id: fieldId(field.key),
      schemaId: DatabaseFieldSchema._schemaId,
      properties: {
        database: dbId,
        name: field.name,
        type: field.type,
        config: field.config ?? {},
        sortKey: sortKey(i),
        width: field.width ?? 200,
        isTitle: field.isTitle ?? false,
        hidden: false
      }
    })
    field.options?.forEach((opt, j) => {
      drafts.push({
        id: optionId(field.key, opt.key),
        schemaId: DatabaseSelectOptionSchema._schemaId,
        properties: {
          field: fieldId(field.key),
          database: dbId,
          name: opt.name,
          color: opt.color,
          sortKey: sortKey(j)
        }
      })
    })
  })

  // Rows: cells written as cell_<fieldId>.
  spec.rows.forEach((row, i) => {
    const properties: Record<string, unknown> = { database: dbId, sortKey: sortKey(i) }
    for (const field of spec.fields) {
      if (!(field.key in row) || row[field.key] === undefined) continue
      const raw = row[field.key]
      let value: unknown
      if (field.type === 'select') {
        value = optionId(field.key, raw as string)
      } else if (field.type === 'multiSelect') {
        value = (raw as string[]).map((optKey) => optionId(field.key, optKey))
      } else {
        // relation (row ids), text/number/date(ISO)/checkbox/person/url/file → literal
        value = raw
      }
      properties[`cell_${fieldId(field.key)}`] = value
    }
    drafts.push({ id: dbRowId(spec.slug, i), schemaId: DatabaseRowSchema._schemaId, properties })
  })

  // Views (field keys translated to field ids throughout).
  spec.views.forEach((view, i) => {
    const filters =
      view.filters && view.filters.length > 0
        ? {
            operator: 'and' as const,
            conditions: view.filters.map((f) => ({
              columnId: fieldId(f.key),
              operator: f.operator,
              ...(f.value !== undefined ? { value: f.value } : {})
            }))
          }
        : undefined
    const sorts = view.sorts?.map((s) => ({ columnId: fieldId(s.key), direction: s.direction }))
    const columnSummaries = view.summaries
      ? Object.fromEntries(Object.entries(view.summaries).map(([k, fn]) => [fieldId(k), fn]))
      : undefined
    drafts.push({
      id: seedId('dbview', spec.slug, view.slug),
      schemaId: DatabaseViewSchema._schemaId,
      properties: {
        database: dbId,
        name: view.name,
        type: view.type,
        sortKey: sortKey(i),
        groupBy: view.groupByKey ? fieldId(view.groupByKey) : undefined,
        dateField: view.dateKey ? fieldId(view.dateKey) : undefined,
        endDateField: view.endDateKey ? fieldId(view.endDateKey) : undefined,
        coverField: view.coverKey ? fieldId(view.coverKey) : undefined,
        cardSize: view.cardSize,
        rowHeight: view.rowHeight,
        hiddenFields: view.hiddenKeys?.map(fieldId),
        filters,
        sorts,
        columnSummaries
      }
    })
  })

  return drafts
}

/** Schemas the database seeder is responsible for (coverage attribution). */
export const DATABASE_SCHEMA_IDS = [
  DatabaseSchema._schemaId,
  DatabaseFieldSchema._schemaId,
  DatabaseSelectOptionSchema._schemaId,
  DatabaseRowSchema._schemaId,
  DatabaseViewSchema._schemaId
]
