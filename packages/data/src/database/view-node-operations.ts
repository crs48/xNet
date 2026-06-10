/**
 * View CRUD operations for the V2 database model.
 *
 * Views are DatabaseView nodes. Each concern (filters, sorts, grouping,
 * per-view layout overrides) is a separate property, so concurrent edits
 * to different concerns merge cleanly under per-property LWW.
 */

import type { FilterGroup, SortConfig, ViewType } from './view-types'
import type { NodeStore } from '../store/store'
import { DatabaseViewSchema } from '../schema/schemas/database-view'
import { createNodeQueryDescriptor } from '../store/query'
import { compareSortKeys, generateSortKey, generateSortKeyWithJitter } from './fractional-index'

const VIEW_SCHEMA_ID = DatabaseViewSchema.schema['@id']

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A database view, read from a DatabaseView node.
 *
 * This is the single ViewConfig shape for V2 — the `@xnetjs/views` dialect
 * (visibleProperties/propertyWidths) is retired.
 */
export interface ViewNode {
  id: string
  database: string
  name: string
  type: ViewType
  filters?: FilterGroup | null
  sorts?: SortConfig[]
  groupBy?: string | null
  groupSort?: 'asc' | 'desc'
  collapsedGroups?: string[]
  /** Per-view field order overrides: fieldId -> fractional sortKey */
  fieldOrder?: Record<string, string>
  /** Per-view width overrides: fieldId -> px */
  fieldWidths?: Record<string, number>
  /** Per-view hidden fields */
  hiddenFields?: string[]
  /** View tab order */
  sortKey: string
  // Gallery/Board
  coverField?: string
  cardSize?: 'small' | 'medium' | 'large'
  // Calendar/Timeline
  dateField?: string
  endDateField?: string
}

export interface CreateViewOptions {
  databaseId: string
  name: string
  type: ViewType
  /** Insert position among view tabs */
  before?: string
  after?: string
}

export type UpdateViewOptions = Partial<Omit<ViewNode, 'id' | 'database' | 'sortKey'>>

// ─── Reads ───────────────────────────────────────────────────────────────────

/**
 * Get all views for a database, ordered by tab sortKey.
 */
export async function getViews(store: NodeStore, databaseId: string): Promise<ViewNode[]> {
  const descriptor = createNodeQueryDescriptor(VIEW_SCHEMA_ID, {
    where: { database: databaseId },
    orderBy: { sortKey: 'asc' }
  })
  const result = await store.query(descriptor)
  return result.nodes.map(toViewNode).sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
}

/**
 * Get a single view by ID.
 */
export async function getView(store: NodeStore, viewId: string): Promise<ViewNode | null> {
  const node = await store.get(viewId)
  if (!node || node.deleted || node.schemaId !== VIEW_SCHEMA_ID) return null
  return toViewNode(node)
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/**
 * Create a view. Returns the new view's node ID.
 */
export async function createView(store: NodeStore, options: CreateViewOptions): Promise<string> {
  const { databaseId, name, type, before, after } = options

  let sortKey: string
  if (before || after) {
    sortKey = generateSortKeyWithJitter(after, before)
  } else {
    const existing = await getViews(store, databaseId)
    const last = existing[existing.length - 1]?.sortKey
    sortKey = generateSortKey(last, undefined)
  }

  const node = await store.create({
    schemaId: VIEW_SCHEMA_ID,
    properties: { database: databaseId, name, type, sortKey }
  })
  return node.id
}

/**
 * Update view properties. Only provided keys are written.
 */
export async function updateView(
  store: NodeStore,
  viewId: string,
  updates: UpdateViewOptions
): Promise<void> {
  const properties: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) properties[key] = value
  }
  if (Object.keys(properties).length === 0) return
  await store.update(viewId, { properties })
}

/**
 * Delete a view.
 */
export async function deleteView(store: NodeStore, viewId: string): Promise<void> {
  await store.delete(viewId)
}

/**
 * Duplicate a view (all configuration copied), positioned after the source.
 * Returns the new view's node ID.
 */
export async function duplicateView(
  store: NodeStore,
  viewId: string,
  newName?: string
): Promise<string | null> {
  const view = await getView(store, viewId)
  if (!view) return null

  const siblings = await getViews(store, view.database)
  const index = siblings.findIndex((v) => v.id === viewId)
  const next = index >= 0 ? siblings[index + 1] : undefined

  const node = await store.create({
    schemaId: VIEW_SCHEMA_ID,
    properties: {
      database: view.database,
      name: newName ?? `${view.name} (Copy)`,
      type: view.type,
      sortKey: generateSortKeyWithJitter(view.sortKey, next?.sortKey),
      ...(view.filters !== undefined && view.filters !== null ? { filters: view.filters } : {}),
      ...(view.sorts !== undefined ? { sorts: view.sorts } : {}),
      ...(view.groupBy !== undefined && view.groupBy !== null ? { groupBy: view.groupBy } : {}),
      ...(view.groupSort !== undefined ? { groupSort: view.groupSort } : {}),
      ...(view.collapsedGroups !== undefined ? { collapsedGroups: view.collapsedGroups } : {}),
      ...(view.fieldOrder !== undefined ? { fieldOrder: view.fieldOrder } : {}),
      ...(view.fieldWidths !== undefined ? { fieldWidths: view.fieldWidths } : {}),
      ...(view.hiddenFields !== undefined ? { hiddenFields: view.hiddenFields } : {}),
      ...(view.coverField !== undefined ? { coverField: view.coverField } : {}),
      ...(view.cardSize !== undefined ? { cardSize: view.cardSize } : {}),
      ...(view.dateField !== undefined ? { dateField: view.dateField } : {}),
      ...(view.endDateField !== undefined ? { endDateField: view.endDateField } : {})
    }
  })
  return node.id
}

/**
 * Move a view tab via fractional index.
 */
export async function moveView(
  store: NodeStore,
  viewId: string,
  position: { before?: string; after?: string }
): Promise<void> {
  const sortKey = generateSortKeyWithJitter(position.after, position.before)
  await store.update(viewId, { properties: { sortKey } })
}

// ─── Focused setters (one concern = one property write) ─────────────────────

export async function setViewFilters(
  store: NodeStore,
  viewId: string,
  filters: FilterGroup | null
): Promise<void> {
  await store.update(viewId, { properties: { filters } })
}

export async function setViewSorts(
  store: NodeStore,
  viewId: string,
  sorts: SortConfig[]
): Promise<void> {
  await store.update(viewId, { properties: { sorts } })
}

export async function setViewGroupBy(
  store: NodeStore,
  viewId: string,
  groupBy: string | null,
  groupSort?: 'asc' | 'desc'
): Promise<void> {
  await store.update(viewId, {
    properties: { groupBy, ...(groupSort !== undefined ? { groupSort } : {}) }
  })
}

export async function toggleViewGroupCollapsed(
  store: NodeStore,
  viewId: string,
  groupKey: string
): Promise<void> {
  const view = await getView(store, viewId)
  if (!view) return
  const collapsed = new Set(view.collapsedGroups ?? [])
  if (collapsed.has(groupKey)) {
    collapsed.delete(groupKey)
  } else {
    collapsed.add(groupKey)
  }
  await store.update(viewId, { properties: { collapsedGroups: [...collapsed] } })
}

/**
 * Hide/show a field in this view.
 */
export async function setFieldHidden(
  store: NodeStore,
  viewId: string,
  fieldId: string,
  hidden: boolean
): Promise<void> {
  const view = await getView(store, viewId)
  if (!view) return
  const set = new Set(view.hiddenFields ?? [])
  if (hidden) {
    set.add(fieldId)
  } else {
    set.delete(fieldId)
  }
  await store.update(viewId, { properties: { hiddenFields: [...set] } })
}

/**
 * Set a per-view column width override.
 */
export async function setViewFieldWidth(
  store: NodeStore,
  viewId: string,
  fieldId: string,
  width: number
): Promise<void> {
  const view = await getView(store, viewId)
  if (!view) return
  await store.update(viewId, {
    properties: { fieldWidths: { ...(view.fieldWidths ?? {}), [fieldId]: width } }
  })
}

/**
 * Set a per-view field order override (fractional key among the view's
 * effective field order).
 */
export async function setViewFieldOrder(
  store: NodeStore,
  viewId: string,
  fieldId: string,
  sortKey: string
): Promise<void> {
  const view = await getView(store, viewId)
  if (!view) return
  await store.update(viewId, {
    properties: { fieldOrder: { ...(view.fieldOrder ?? {}), [fieldId]: sortKey } }
  })
}

// ─── Effective ordering helper ───────────────────────────────────────────────

/**
 * Compute the effective field order for a view: per-view fieldOrder
 * overrides win, otherwise the field's own sortKey.
 */
export function effectiveFieldSortKey(
  view: Pick<ViewNode, 'fieldOrder'>,
  field: { id: string; sortKey: string }
): string {
  return view.fieldOrder?.[field.id] ?? field.sortKey
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toViewNode(node: { id: string; properties: Record<string, unknown> }): ViewNode {
  const p = node.properties
  return {
    id: node.id,
    database: p.database as string,
    name: p.name as string,
    type: (p.type as ViewType) ?? 'table',
    filters: (p.filters as FilterGroup | undefined) ?? null,
    sorts: (p.sorts as SortConfig[] | undefined) ?? [],
    groupBy: (p.groupBy as string | undefined) ?? null,
    groupSort: p.groupSort as 'asc' | 'desc' | undefined,
    collapsedGroups: (p.collapsedGroups as string[] | undefined) ?? [],
    fieldOrder: p.fieldOrder as Record<string, string> | undefined,
    fieldWidths: p.fieldWidths as Record<string, number> | undefined,
    hiddenFields: (p.hiddenFields as string[] | undefined) ?? [],
    sortKey: p.sortKey as string,
    coverField: p.coverField as string | undefined,
    cardSize: p.cardSize as 'small' | 'medium' | 'large' | undefined,
    dateField: p.dateField as string | undefined,
    endDateField: p.endDateField as string | undefined
  }
}
