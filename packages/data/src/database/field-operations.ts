/**
 * Field CRUD operations for the V2 database model.
 *
 * Fields are DatabaseField nodes; select options are DatabaseSelectOption
 * nodes. Ordering uses the same fractional indexing scheme as rows, so
 * reorders are O(1) single-property updates that merge under LWW.
 */

import type {
  FieldConfig,
  FieldNode,
  FieldType,
  SelectColor,
  SelectOptionNode
} from './field-types'
import type { NodeStore } from '../store/store'
import type { TransactionOperation } from '../store/types'
import { DatabaseFieldSchema } from '../schema/schemas/database-field'
import { DatabaseSelectOptionSchema } from '../schema/schemas/database-select-option'
import { createNodeQueryDescriptor } from '../store/query'
import {
  autoColor,
  isFieldType,
  isSelectColor,
  toFieldNode,
  toSelectOptionNode
} from './field-types'
import { compareSortKeys, generateSortKeyWithJitter } from './fractional-index'

const FIELD_SCHEMA_ID = DatabaseFieldSchema.schema['@id']
const OPTION_SCHEMA_ID = DatabaseSelectOptionSchema.schema['@id']

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateFieldOptions {
  /** Parent database ID */
  databaseId: string
  /** Display name */
  name: string
  /** Field type */
  type: FieldType
  /** Type-specific configuration */
  config?: FieldConfig
  /** Default column width */
  width?: number
  /** Whether this is the title field */
  isTitle?: boolean
  /** Insert position: before this field's sortKey */
  before?: string
  /** Insert position: after this field's sortKey */
  after?: string
}

export interface UpdateFieldOptions {
  name?: string
  type?: FieldType
  config?: FieldConfig
  width?: number
  isTitle?: boolean
  hidden?: boolean
}

export interface CreateSelectOptionOptions {
  /** Parent field ID */
  fieldId: string
  /** Option display name */
  name: string
  /** Option color (auto-derived from name when omitted) */
  color?: SelectColor
}

// ─── Field reads ─────────────────────────────────────────────────────────────

/**
 * Get all fields for a database, ordered by sortKey.
 */
export async function getFields(store: NodeStore, databaseId: string): Promise<FieldNode[]> {
  const descriptor = createNodeQueryDescriptor(FIELD_SCHEMA_ID, {
    where: { database: databaseId },
    orderBy: { sortKey: 'asc' }
  })
  const result = await store.query(descriptor)
  return result.nodes.map(toFieldNode).sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
}

/**
 * Get a single field by ID.
 */
export async function getField(store: NodeStore, fieldId: string): Promise<FieldNode | null> {
  const node = await store.get(fieldId)
  if (!node || node.deleted || node.schemaId !== FIELD_SCHEMA_ID) return null
  return toFieldNode(node)
}

/**
 * Get the title field for a database.
 */
export async function getTitleField(
  store: NodeStore,
  databaseId: string
): Promise<FieldNode | null> {
  const fields = await getFields(store, databaseId)
  return fields.find((f) => f.isTitle) ?? null
}

// ─── Field writes ────────────────────────────────────────────────────────────

/**
 * Create a new field. Returns the new field's node ID.
 *
 * @example
 * ```typescript
 * const fieldId = await createField(store, {
 *   databaseId,
 *   name: 'Status',
 *   type: 'select'
 * })
 * ```
 */
export async function createField(store: NodeStore, options: CreateFieldOptions): Promise<string> {
  const { databaseId, name, type, config = {}, width, isTitle, before, after } = options

  if (!isFieldType(type)) {
    throw new Error(`Invalid field type: ${String(type)}`)
  }

  const sortKey = await resolveSortKey(
    store,
    FIELD_SCHEMA_ID,
    { database: databaseId },
    before,
    after
  )

  const node = await store.create({
    schemaId: FIELD_SCHEMA_ID,
    properties: {
      database: databaseId,
      name,
      type,
      config,
      sortKey,
      ...(width !== undefined ? { width } : {}),
      ...(isTitle !== undefined ? { isTitle } : {})
    }
  })

  return node.id
}

/**
 * Update a field's properties. Only provided keys are written, so
 * concurrent edits to different aspects (rename vs resize) merge cleanly.
 */
export async function updateField(
  store: NodeStore,
  fieldId: string,
  updates: UpdateFieldOptions
): Promise<void> {
  if (updates.type !== undefined && !isFieldType(updates.type)) {
    throw new Error(`Invalid field type: ${String(updates.type)}`)
  }

  const properties: Record<string, unknown> = {}
  if (updates.name !== undefined) properties.name = updates.name
  if (updates.type !== undefined) properties.type = updates.type
  if (updates.config !== undefined) properties.config = updates.config
  if (updates.width !== undefined) properties.width = updates.width
  if (updates.isTitle !== undefined) properties.isTitle = updates.isTitle
  if (updates.hidden !== undefined) properties.hidden = updates.hidden

  if (Object.keys(properties).length === 0) return
  await store.update(fieldId, { properties })
}

/**
 * Delete a field and its select options.
 *
 * Cell values under the field's `cell_<id>` key are left in place on rows
 * (orphaned data is invisible and avoids a full-table write storm — the
 * same call Notion makes).
 */
export async function deleteField(store: NodeStore, fieldId: string): Promise<void> {
  const options = await getSelectOptions(store, fieldId)
  const operations: TransactionOperation[] = [
    ...options.map((option) => ({ type: 'delete' as const, nodeId: option.id })),
    { type: 'delete' as const, nodeId: fieldId }
  ]
  await store.transaction(operations)
}

/**
 * Move a field to a new position via fractional index.
 *
 * @example
 * ```typescript
 * await moveField(store, fieldId, { after: fieldA.sortKey, before: fieldB.sortKey })
 * ```
 */
export async function moveField(
  store: NodeStore,
  fieldId: string,
  position: { before?: string; after?: string }
): Promise<void> {
  const sortKey = generateSortKeyWithJitter(position.after, position.before)
  await store.update(fieldId, { properties: { sortKey } })
}

/**
 * Duplicate a field (its select options included).
 * Returns the new field's node ID, positioned right after the source.
 */
export async function duplicateField(
  store: NodeStore,
  fieldId: string,
  newName?: string
): Promise<string | null> {
  const field = await getField(store, fieldId)
  if (!field) return null

  const siblings = await getFields(store, field.database)
  const index = siblings.findIndex((f) => f.id === fieldId)
  const next = index >= 0 ? siblings[index + 1] : undefined

  const newId = await createField(store, {
    databaseId: field.database,
    name: newName ?? `${field.name} (Copy)`,
    type: field.type,
    config: field.config,
    width: field.width,
    after: field.sortKey,
    before: next?.sortKey
    // isTitle intentionally not copied — only one title field allowed
  })

  const options = await getSelectOptions(store, fieldId)
  for (const option of options) {
    await store.create({
      schemaId: OPTION_SCHEMA_ID,
      properties: {
        field: newId,
        name: option.name,
        ...(option.color ? { color: option.color } : {}),
        sortKey: option.sortKey
      }
    })
  }

  return newId
}

// ─── Select options ──────────────────────────────────────────────────────────

/**
 * Get all options for a select/multiSelect field, ordered by sortKey.
 */
export async function getSelectOptions(
  store: NodeStore,
  fieldId: string
): Promise<SelectOptionNode[]> {
  const descriptor = createNodeQueryDescriptor(OPTION_SCHEMA_ID, {
    where: { field: fieldId },
    orderBy: { sortKey: 'asc' }
  })
  const result = await store.query(descriptor)
  return result.nodes.map(toSelectOptionNode).sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
}

/**
 * Create a select option (the typeahead "＋ Create" path).
 * Returns the new option's node ID.
 *
 * Concurrent creates from multiple collaborators are safe by construction:
 * each create is an independent node.
 */
export async function createSelectOption(
  store: NodeStore,
  options: CreateSelectOptionOptions
): Promise<string> {
  const { fieldId, name, color } = options
  if (color !== undefined && !isSelectColor(color)) {
    throw new Error(`Invalid select color: ${String(color)}`)
  }

  const sortKey = await resolveSortKey(store, OPTION_SCHEMA_ID, { field: fieldId })

  const node = await store.create({
    schemaId: OPTION_SCHEMA_ID,
    properties: {
      field: fieldId,
      name,
      color: color ?? autoColor(name),
      sortKey
    }
  })

  return node.id
}

/**
 * Rename or recolor an option.
 */
export async function updateSelectOption(
  store: NodeStore,
  optionId: string,
  updates: { name?: string; color?: SelectColor }
): Promise<void> {
  if (updates.color !== undefined && !isSelectColor(updates.color)) {
    throw new Error(`Invalid select color: ${String(updates.color)}`)
  }
  const properties: Record<string, unknown> = {}
  if (updates.name !== undefined) properties.name = updates.name
  if (updates.color !== undefined) properties.color = updates.color
  if (Object.keys(properties).length === 0) return
  await store.update(optionId, { properties })
}

/**
 * Delete an option. Cells referencing the option keep the dangling ID;
 * renderers must drop unknown option IDs (same behavior as deleted rows
 * in relation cells).
 */
export async function deleteSelectOption(store: NodeStore, optionId: string): Promise<void> {
  await store.delete(optionId)
}

/**
 * Reorder an option via fractional index.
 */
export async function moveSelectOption(
  store: NodeStore,
  optionId: string,
  position: { before?: string; after?: string }
): Promise<void> {
  const sortKey = generateSortKeyWithJitter(position.after, position.before)
  await store.update(optionId, { properties: { sortKey } })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve a fractional sortKey for an insert. When no position is given,
 * appends after the current last sibling.
 */
async function resolveSortKey(
  store: NodeStore,
  schemaId: typeof FIELD_SCHEMA_ID | typeof OPTION_SCHEMA_ID,
  where: Record<string, unknown>,
  before?: string,
  after?: string
): Promise<string> {
  if (before || after) {
    return generateSortKeyWithJitter(after, before)
  }
  const descriptor = createNodeQueryDescriptor(schemaId, {
    where,
    orderBy: { sortKey: 'desc' },
    limit: 1
  })
  const result = await store.query(descriptor)
  const last = result.nodes[0]?.properties.sortKey as string | undefined
  return generateSortKeyWithJitter(last, undefined)
}
