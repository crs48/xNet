/**
 * Field type definitions for the V2 database model.
 *
 * V2 stores fields as first-class DatabaseField nodes (see
 * schema/schemas/database-field.ts) ordered by fractional sortKey, rather
 * than as Y.Array entries in the database Y.Doc. The type/config unions are
 * shared with the legacy column model (column-types.ts) so the pure engines
 * (filter/sort/group/rollup/formula) work unchanged.
 *
 * Select/multiSelect options are NOT part of the field config in V2 — they
 * are DatabaseSelectOption nodes keyed by `field`, so concurrent option
 * creation merges cleanly. SelectFieldConfig retains only behavioral flags.
 */

import type {
  ColumnType,
  ColumnConfig,
  SelectColor,
  NumberColumnConfig,
  TextColumnConfig,
  RelationColumnConfig,
  RollupColumnConfig,
  RollupAggregation,
  FormulaColumnConfig,
  DateColumnConfig,
  FileColumnConfig
} from './column-types'
import type { DatabaseField } from '../schema/schemas/database-field'
import type { DatabaseSelectOption } from '../schema/schemas/database-select-option'
import {
  isNodeStoreColumnType,
  isComputedColumnType,
  isAutoColumnType,
  isYDocColumnType
} from './column-types'

// ─── Field Types (aliases over the shared unions) ────────────────────────────

/** All supported field types. */
export type FieldType = ColumnType

/** Type-specific field configuration. */
export type FieldConfig = ColumnConfig

export type {
  SelectColor,
  NumberColumnConfig as NumberFieldConfig,
  TextColumnConfig as TextFieldConfig,
  RelationColumnConfig as RelationFieldConfig,
  RollupColumnConfig as RollupFieldConfig,
  RollupAggregation,
  FormulaColumnConfig as FormulaFieldConfig,
  DateColumnConfig as DateFieldConfig,
  FileColumnConfig as FileFieldConfig
}

/** Valid field type values, for runtime enforcement in field-operations. */
export const FIELD_TYPES: readonly FieldType[] = [
  'text',
  'number',
  'checkbox',
  'date',
  'dateRange',
  'geo',
  'select',
  'multiSelect',
  'person',
  'url',
  'email',
  'phone',
  'file',
  'relation',
  'rollup',
  'formula',
  'richText',
  'created',
  'createdBy',
  'updated',
  'updatedBy'
] as const

export function isFieldType(value: unknown): value is FieldType {
  return typeof value === 'string' && (FIELD_TYPES as readonly string[]).includes(value)
}

/** Valid select option colors. */
export const SELECT_COLORS: readonly SelectColor[] = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red'
] as const

export function isSelectColor(value: unknown): value is SelectColor {
  return typeof value === 'string' && (SELECT_COLORS as readonly string[]).includes(value)
}

/**
 * Pick a deterministic color for a new option from its name, so
 * typeahead-created tags get stable, pleasant colors without a picker.
 */
export function autoColor(name: string): SelectColor {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return SELECT_COLORS[Math.abs(hash) % SELECT_COLORS.length]
}

// ─── Type guards (delegate to the shared implementations) ────────────────────

export const isNodeStoreFieldType = isNodeStoreColumnType
export const isComputedFieldType = isComputedColumnType
export const isAutoFieldType = isAutoColumnType
export const isYDocFieldType = isYDocColumnType

// ─── Node-level helpers ──────────────────────────────────────────────────────

/** A DatabaseField node narrowed with typed properties access. */
export interface FieldNode {
  id: string
  database: string
  name: string
  type: FieldType
  config: FieldConfig
  sortKey: string
  width?: number
  isTitle?: boolean
  hidden?: boolean
}

/** A DatabaseSelectOption node narrowed for picker use. */
export interface SelectOptionNode {
  id: string
  field: string
  database: string
  name: string
  color?: SelectColor
  sortKey: string
}

/** Extract a FieldNode from a raw node's properties. */
export function toFieldNode(node: { id: string; properties: Record<string, unknown> }): FieldNode {
  const p = node.properties
  return {
    id: node.id,
    database: p.database as string,
    name: p.name as string,
    type: p.type as FieldType,
    config: (p.config as FieldConfig) ?? {},
    sortKey: p.sortKey as string,
    width: p.width as number | undefined,
    isTitle: p.isTitle as boolean | undefined,
    hidden: p.hidden as boolean | undefined
  }
}

/** Extract a SelectOptionNode from a raw node's properties. */
export function toSelectOptionNode(node: {
  id: string
  properties: Record<string, unknown>
}): SelectOptionNode {
  const p = node.properties
  return {
    id: node.id,
    field: p.field as string,
    database: p.database as string,
    name: p.name as string,
    color: p.color as SelectColor | undefined,
    sortKey: p.sortKey as string
  }
}

// Re-export the node types for convenience
export type { DatabaseField, DatabaseSelectOption }
