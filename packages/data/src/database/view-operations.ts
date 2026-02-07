/**
 * View CRUD operations for database views.
 *
 * Views are stored in the database's Y.Doc as a Y.Map of view configs.
 * This enables collaborative view editing and real-time sync.
 */

import type { ViewConfig, ViewType, FilterGroup, SortConfig } from './view-types'
import { nanoid } from 'nanoid'
import * as Y from 'yjs'

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Get all views from a database doc.
 *
 * @example
 * ```typescript
 * const views = getViews(doc)
 * console.log(views.map(v => v.name))
 * ```
 */
export function getViews(doc: Y.Doc): ViewConfig[] {
  const views = doc.getMap('views')
  const result: ViewConfig[] = []

  views.forEach((view, id) => {
    const viewMap = view as Y.Map<unknown>
    result.push(viewMapToConfig(viewMap, id))
  })

  return result
}

/**
 * Get a single view by ID.
 *
 * @example
 * ```typescript
 * const view = getView(doc, 'abc123')
 * if (view) {
 *   console.log(view.name, view.type)
 * }
 * ```
 */
export function getView(doc: Y.Doc, viewId: string): ViewConfig | null {
  const views = doc.getMap('views')
  const view = views.get(viewId) as Y.Map<unknown> | undefined

  if (!view) return null
  return viewMapToConfig(view, viewId)
}

/**
 * Get the first view of a specific type.
 */
export function getViewByType(doc: Y.Doc, type: ViewType): ViewConfig | null {
  const views = doc.getMap('views')

  let result: ViewConfig | null = null
  views.forEach((view, id) => {
    if (result) return // Already found
    const viewMap = view as Y.Map<unknown>
    if (viewMap.get('type') === type) {
      result = viewMapToConfig(viewMap, id)
    }
  })

  return result
}

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Create a new view.
 * Returns the new view ID.
 *
 * @example
 * ```typescript
 * const id = createView(doc, {
 *   name: 'Board View',
 *   type: 'board',
 *   visibleColumns: ['col1', 'col2'],
 *   groupBy: 'col1'
 * })
 * ```
 */
export function createView(doc: Y.Doc, config: Omit<ViewConfig, 'id'>): string {
  const views = doc.getMap('views')
  const viewId = nanoid()

  doc.transact(() => {
    const view = new Y.Map()
    view.set('name', config.name)
    view.set('type', config.type)
    view.set('visibleColumns', config.visibleColumns)
    if (config.columnWidths) view.set('columnWidths', config.columnWidths)
    view.set('filters', config.filters ?? null)
    view.set('sorts', config.sorts ?? [])
    view.set('groupBy', config.groupBy ?? null)
    if (config.groupSort) view.set('groupSort', config.groupSort)
    if (config.collapsedGroups) view.set('collapsedGroups', config.collapsedGroups)
    if (config.coverColumn) view.set('coverColumn', config.coverColumn)
    if (config.cardSize) view.set('cardSize', config.cardSize)
    if (config.dateColumn) view.set('dateColumn', config.dateColumn)
    if (config.endDateColumn) view.set('endDateColumn', config.endDateColumn)

    views.set(viewId, view)
  })

  return viewId
}

/**
 * Update a view's properties.
 *
 * @example
 * ```typescript
 * updateView(doc, 'abc123', { name: 'My Board' })
 * ```
 */
export function updateView(
  doc: Y.Doc,
  viewId: string,
  updates: Partial<Omit<ViewConfig, 'id'>>
): void {
  const views = doc.getMap('views')
  const view = views.get(viewId) as Y.Map<unknown> | undefined

  if (!view) return

  doc.transact(() => {
    for (const [key, value] of Object.entries(updates)) {
      view.set(key, value)
    }
  })
}

/**
 * Delete a view.
 *
 * @example
 * ```typescript
 * deleteView(doc, 'abc123')
 * ```
 */
export function deleteView(doc: Y.Doc, viewId: string): void {
  const views = doc.getMap('views')
  views.delete(viewId)
}

/**
 * Duplicate a view.
 * Returns the new view ID.
 *
 * @example
 * ```typescript
 * const newId = duplicateView(doc, 'abc123', 'My Copy')
 * ```
 */
export function duplicateView(doc: Y.Doc, viewId: string, newName?: string): string {
  const existingView = getView(doc, viewId)
  if (!existingView) {
    throw new Error(`View ${viewId} not found`)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...config } = existingView
  return createView(doc, {
    ...config,
    name: newName ?? `${existingView.name} (Copy)`
  })
}

// ─── Filter Operations ────────────────────────────────────────────────────────

/**
 * Set the filters for a view.
 *
 * @example
 * ```typescript
 * setViewFilters(doc, 'view123', {
 *   operator: 'and',
 *   conditions: [
 *     { columnId: 'status', operator: 'equals', value: 'done' }
 *   ]
 * })
 * ```
 */
export function setViewFilters(doc: Y.Doc, viewId: string, filters: FilterGroup | null): void {
  updateView(doc, viewId, { filters })
}

/**
 * Clear all filters from a view.
 */
export function clearViewFilters(doc: Y.Doc, viewId: string): void {
  setViewFilters(doc, viewId, null)
}

// ─── Sort Operations ──────────────────────────────────────────────────────────

/**
 * Set the sorts for a view.
 *
 * @example
 * ```typescript
 * setViewSorts(doc, 'view123', [
 *   { columnId: 'date', direction: 'desc' },
 *   { columnId: 'name', direction: 'asc' }
 * ])
 * ```
 */
export function setViewSorts(doc: Y.Doc, viewId: string, sorts: SortConfig[]): void {
  updateView(doc, viewId, { sorts })
}

/**
 * Add a sort to a view.
 */
export function addViewSort(doc: Y.Doc, viewId: string, sort: SortConfig): void {
  const view = getView(doc, viewId)
  if (!view) return

  const sorts = [...(view.sorts ?? []), sort]
  setViewSorts(doc, viewId, sorts)
}

/**
 * Remove a sort from a view by column ID.
 */
export function removeViewSort(doc: Y.Doc, viewId: string, columnId: string): void {
  const view = getView(doc, viewId)
  if (!view) return

  const sorts = (view.sorts ?? []).filter((s) => s.columnId !== columnId)
  setViewSorts(doc, viewId, sorts)
}

/**
 * Clear all sorts from a view.
 */
export function clearViewSorts(doc: Y.Doc, viewId: string): void {
  setViewSorts(doc, viewId, [])
}

// ─── Group Operations ─────────────────────────────────────────────────────────

/**
 * Set the group by column for a view.
 */
export function setViewGroupBy(doc: Y.Doc, viewId: string, columnId: string | null): void {
  updateView(doc, viewId, { groupBy: columnId })
}

/**
 * Toggle a group's collapsed state.
 */
export function toggleGroupCollapsed(doc: Y.Doc, viewId: string, groupId: string): void {
  const view = getView(doc, viewId)
  if (!view) return

  const collapsed = view.collapsedGroups ?? []
  const isCollapsed = collapsed.includes(groupId)

  updateView(doc, viewId, {
    collapsedGroups: isCollapsed
      ? collapsed.filter((id) => id !== groupId)
      : [...collapsed, groupId]
  })
}

// ─── Column Visibility ────────────────────────────────────────────────────────

/**
 * Set which columns are visible in a view.
 */
export function setVisibleColumns(doc: Y.Doc, viewId: string, columnIds: string[]): void {
  updateView(doc, viewId, { visibleColumns: columnIds })
}

/**
 * Show a column in a view.
 */
export function showColumn(doc: Y.Doc, viewId: string, columnId: string): void {
  const view = getView(doc, viewId)
  if (!view) return

  if (!view.visibleColumns.includes(columnId)) {
    updateView(doc, viewId, {
      visibleColumns: [...view.visibleColumns, columnId]
    })
  }
}

/**
 * Hide a column in a view.
 */
export function hideColumn(doc: Y.Doc, viewId: string, columnId: string): void {
  const view = getView(doc, viewId)
  if (!view) return

  updateView(doc, viewId, {
    visibleColumns: view.visibleColumns.filter((id) => id !== columnId)
  })
}

/**
 * Reorder columns in a view.
 */
export function reorderViewColumns(
  doc: Y.Doc,
  viewId: string,
  columnId: string,
  newIndex: number
): void {
  const view = getView(doc, viewId)
  if (!view) return

  const columns = [...view.visibleColumns]
  const currentIndex = columns.indexOf(columnId)
  if (currentIndex === -1) return

  columns.splice(currentIndex, 1)
  columns.splice(newIndex, 0, columnId)

  updateView(doc, viewId, { visibleColumns: columns })
}

/**
 * Set a column's width in a view.
 */
export function setColumnWidth(doc: Y.Doc, viewId: string, columnId: string, width: number): void {
  const view = getView(doc, viewId)
  if (!view) return

  updateView(doc, viewId, {
    columnWidths: {
      ...(view.columnWidths ?? {}),
      [columnId]: width
    }
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a Y.Map to a ViewConfig.
 */
function viewMapToConfig(view: Y.Map<unknown>, id: string): ViewConfig {
  return {
    id,
    name: view.get('name') as string,
    type: view.get('type') as ViewType,
    visibleColumns: (view.get('visibleColumns') as string[]) ?? [],
    columnWidths: view.get('columnWidths') as Record<string, number> | undefined,
    filters: view.get('filters') as FilterGroup | null,
    sorts: (view.get('sorts') as SortConfig[]) ?? [],
    groupBy: view.get('groupBy') as string | null,
    groupSort: view.get('groupSort') as 'asc' | 'desc' | undefined,
    collapsedGroups: view.get('collapsedGroups') as string[] | undefined,
    coverColumn: view.get('coverColumn') as string | undefined,
    cardSize: view.get('cardSize') as 'small' | 'medium' | 'large' | undefined,
    dateColumn: view.get('dateColumn') as string | undefined,
    endDateColumn: view.get('endDateColumn') as string | undefined
  }
}
