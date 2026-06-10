/**
 * useGridDatabase - The V2 database hook (exploration 0159).
 *
 * One subscription path: fields, views, select options, and rows are all
 * nodes read through useQuery (DataBridge → SQLite, with materialized view
 * caching and full-text search). View nodes are the single source of truth
 * for sort/filter/layout — there is no mirrored React state to drift.
 *
 * Replaces the legacy useDatabase/useDatabaseDoc pair (Y.Doc columns/views,
 * 10× over-fetch, client-side pipeline over the whole table).
 */

import {
  type CellValue,
  type ColumnDefinition,
  type FieldConfig,
  type FieldType,
  type FilterGroup,
  type SortConfig,
  type ViewType,
  DatabaseFieldSchema,
  DatabaseRowSchema,
  DatabaseSchema,
  DatabaseSelectOptionSchema,
  DatabaseViewSchema,
  autoColor,
  cellKey,
  compareSortKeys,
  filterRows,
  fromCellProperties,
  generateSortKeyWithJitter,
  sortRows
} from '@xnetjs/data'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useIdentity } from './useIdentity'
import { useMutate } from './useMutate'
import { useQuery } from './useQuery'
import { useUndoScope } from './useUndoScope'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GridFieldModel {
  id: string
  name: string
  type: FieldType
  config: FieldConfig
  sortKey: string
  width: number
  isTitle?: boolean
  hidden?: boolean
  options?: GridOptionModel[]
}

export interface GridOptionModel {
  id: string
  field: string
  name: string
  color?: string
  sortKey: string
}

export interface GridViewModel {
  id: string
  name: string
  type: ViewType
  filters: FilterGroup | null
  sorts: SortConfig[]
  groupBy: string | null
  collapsedGroups: string[]
  fieldOrder: Record<string, string>
  fieldWidths: Record<string, number>
  hiddenFields: string[]
  sortKey: string
}

export interface GridRowModel {
  id: string
  sortKey: string
  cells: Record<string, CellValue>
}

export interface UseGridDatabaseOptions {
  /** Active view ID (defaults to the first view) */
  viewId?: string
  /** Quick-find text (full-text search via SQLite FTS) */
  search?: string
  /** Row window size (default 500) */
  pageSize?: number
}

export interface UseGridDatabaseResult {
  /** Database node (flattened) */
  database: { id: string; title?: string; icon?: string } | null
  /** All fields, database order */
  fields: GridFieldModel[]
  /** Fields for the active view: order overrides applied, hidden removed */
  visibleFields: GridFieldModel[]
  /** All views, tab order */
  views: GridViewModel[]
  activeView: GridViewModel | null
  /** Rows: view filters + sorts applied to the fetched window */
  rows: GridRowModel[]
  loading: boolean

  // Cell/row mutations
  updateCell: (rowId: string, fieldId: string, value: CellValue) => Promise<void>
  clearCells: (cells: Array<{ rowId: string; fieldId: string }>) => Promise<void>
  addRow: (afterRowId?: string, cells?: Record<string, CellValue>) => Promise<string | null>
  deleteRows: (rowIds: string[]) => Promise<void>
  moveRowToIndex: (rowId: string, targetIndex: number) => Promise<void>

  // Field mutations
  addField: (name: string, type: FieldType, config?: FieldConfig) => Promise<string | null>
  renameField: (fieldId: string, name: string) => Promise<void>
  updateFieldConfig: (fieldId: string, config: FieldConfig) => Promise<void>
  changeFieldType: (fieldId: string, type: FieldType) => Promise<void>
  removeField: (fieldId: string) => Promise<void>
  moveFieldToIndex: (fieldId: string, targetIndex: number) => Promise<void>
  resizeField: (fieldId: string, width: number) => Promise<void>
  setFieldHidden: (fieldId: string, hidden: boolean) => Promise<void>

  // Select options
  createOption: (fieldId: string, name: string) => Promise<string | null>

  // View mutations
  toggleSort: (fieldId: string) => Promise<void>
  setFilters: (filters: FilterGroup | null) => Promise<void>
  setGroupBy: (fieldId: string | null) => Promise<void>
  addView: (name: string, type: ViewType) => Promise<string | null>
  renameView: (viewId: string, name: string) => Promise<void>
  removeView: (viewId: string) => Promise<void>

  // Undo
  undo: () => Promise<boolean>
  redo: () => Promise<boolean>
  canUndo: boolean
  canRedo: boolean
}

// ─── Internals ───────────────────────────────────────────────────────────────

/** Loose property bag from a FlatNode (properties hoisted to top level). */
type Flat = Record<string, unknown> & { id: string }

function toFieldModel(node: Flat): GridFieldModel {
  return {
    id: node.id,
    name: (node.name as string) ?? '',
    type: (node.type as FieldType) ?? 'text',
    config: (node.config as FieldConfig) ?? {},
    sortKey: (node.sortKey as string) ?? '',
    width: (node.width as number) ?? 150,
    isTitle: node.isTitle as boolean | undefined,
    hidden: node.hidden as boolean | undefined
  }
}

function toViewModel(node: Flat): GridViewModel {
  return {
    id: node.id,
    name: (node.name as string) ?? '',
    type: (node.type as ViewType) ?? 'table',
    filters: (node.filters as FilterGroup | undefined) ?? null,
    sorts: (node.sorts as SortConfig[] | undefined) ?? [],
    groupBy: (node.groupBy as string | undefined) ?? null,
    collapsedGroups: (node.collapsedGroups as string[] | undefined) ?? [],
    fieldOrder: (node.fieldOrder as Record<string, string> | undefined) ?? {},
    fieldWidths: (node.fieldWidths as Record<string, number> | undefined) ?? {},
    hiddenFields: (node.hiddenFields as string[] | undefined) ?? [],
    sortKey: (node.sortKey as string) ?? ''
  }
}

function fieldsToColumnDefinitions(fields: GridFieldModel[]): ColumnDefinition[] {
  return fields.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type as ColumnDefinition['type'],
    config: f.config as ColumnDefinition['config'],
    width: f.width,
    isTitle: f.isTitle
  }))
}

/**
 * Fractional key for dropping an item at targetIndex within an ordered
 * list (the moved item removed first, Sheets/Notion drop semantics).
 */
function dropSortKey(
  ordered: Array<{ id: string; key: string }>,
  movedId: string,
  targetIndex: number
): string {
  const without = ordered.filter((item) => item.id !== movedId)
  const clamped = Math.max(0, Math.min(targetIndex, without.length))
  const before = without[clamped - 1]?.key
  const after = without[clamped]?.key
  return generateSortKeyWithJitter(before, after)
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGridDatabase(
  databaseId: string,
  options: UseGridDatabaseOptions = {}
): UseGridDatabaseResult {
  const { viewId, search, pageSize = 500 } = options
  const mutate = useMutate()
  const { did } = useIdentity()

  // ─── Reads (one path: useQuery → DataBridge → SQLite) ────────────────────

  const { data: database, status: dbStatus } = useQuery(DatabaseSchema, databaseId)

  const { data: fieldNodes, status: fieldStatus } = useQuery(DatabaseFieldSchema, {
    where: { database: databaseId },
    orderBy: { sortKey: 'asc' }
  })

  const { data: viewNodes, status: viewStatus } = useQuery(DatabaseViewSchema, {
    where: { database: databaseId },
    orderBy: { sortKey: 'asc' }
  })

  const { data: optionNodes } = useQuery(DatabaseSelectOptionSchema, {
    where: { database: databaseId },
    orderBy: { sortKey: 'asc' }
  })

  const { data: rowNodes, status: rowStatus } = useQuery(DatabaseRowSchema, {
    where: { database: databaseId },
    orderBy: { sortKey: 'asc' },
    limit: pageSize,
    materializedView: `db:${databaseId}${viewId ? `:view:${viewId}` : ''}`,
    ...(search ? { search } : {})
  })

  // ─── Derived models ───────────────────────────────────────────────────────

  const optionsByField = useMemo(() => {
    const map = new Map<string, GridOptionModel[]>()
    for (const node of (optionNodes ?? []) as unknown as Flat[]) {
      const option: GridOptionModel = {
        id: node.id,
        field: node.field as string,
        name: (node.name as string) ?? '',
        color: node.color as string | undefined,
        sortKey: (node.sortKey as string) ?? ''
      }
      const list = map.get(option.field) ?? []
      list.push(option)
      map.set(option.field, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
    }
    return map
  }, [optionNodes])

  const fields = useMemo(() => {
    const models = ((fieldNodes ?? []) as unknown as Flat[]).map(toFieldModel)
    models.sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
    return models.map((f) =>
      f.type === 'select' || f.type === 'multiSelect'
        ? { ...f, options: optionsByField.get(f.id) ?? [] }
        : f
    )
  }, [fieldNodes, optionsByField])

  const views = useMemo(() => {
    const models = ((viewNodes ?? []) as unknown as Flat[]).map(toViewModel)
    models.sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
    return models
  }, [viewNodes])

  const activeView = useMemo(() => {
    if (viewId) return views.find((v) => v.id === viewId) ?? views[0] ?? null
    return views[0] ?? null
  }, [views, viewId])

  const visibleFields = useMemo(() => {
    if (!activeView) return fields
    const hidden = new Set(activeView.hiddenFields)
    const effective = fields
      .filter((f) => !hidden.has(f.id) && !f.hidden)
      .map((f) => ({
        field: { ...f, width: activeView.fieldWidths[f.id] ?? f.width },
        key: activeView.fieldOrder[f.id] ?? f.sortKey
      }))
    effective.sort((a, b) => compareSortKeys(a.key, b.key))
    return effective.map((e) => e.field)
  }, [fields, activeView])

  const rows = useMemo(() => {
    const base: GridRowModel[] = ((rowNodes ?? []) as unknown as Flat[]).map((node) => ({
      id: node.id,
      sortKey: (node.sortKey as string) ?? '',
      cells: fromCellProperties(node)
    }))
    // Fractional-index comparator is the final ordering authority
    base.sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
    if (!activeView) return base
    const columns = fieldsToColumnDefinitions(fields)
    const filtered = filterRows(base, columns, activeView.filters)
    return sortRows(filtered, columns, activeView.sorts)
  }, [rowNodes, activeView, fields])

  const loading =
    dbStatus === 'loading' ||
    fieldStatus === 'loading' ||
    viewStatus === 'loading' ||
    rowStatus === 'loading'

  // ─── Append-key tails ─────────────────────────────────────────────────────
  // Query results lag mutations within a burst (e.g. three addRow calls in
  // one tick), so appends track the last issued key in refs — synchronously
  // bumped on create, re-synced from data when it catches up.

  const rowTailRef = useRef<string | undefined>(undefined)
  const fieldTailRef = useRef<string | undefined>(undefined)
  const viewTailRef = useRef<string | undefined>(undefined)
  const optionTailRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    const dataTail = rows.reduce<string | undefined>(
      (max, r) => (!max || compareSortKeys(r.sortKey, max) > 0 ? r.sortKey : max),
      undefined
    )
    if (dataTail && (!rowTailRef.current || compareSortKeys(dataTail, rowTailRef.current) > 0)) {
      rowTailRef.current = dataTail
    }
  }, [rows])

  useEffect(() => {
    const dataTail = fields[fields.length - 1]?.sortKey
    if (
      dataTail &&
      (!fieldTailRef.current || compareSortKeys(dataTail, fieldTailRef.current) > 0)
    ) {
      fieldTailRef.current = dataTail
    }
  }, [fields])

  useEffect(() => {
    const dataTail = views[views.length - 1]?.sortKey
    if (dataTail && (!viewTailRef.current || compareSortKeys(dataTail, viewTailRef.current) > 0)) {
      viewTailRef.current = dataTail
    }
  }, [views])

  useEffect(() => {
    for (const [fieldId, list] of optionsByField) {
      const dataTail = list[list.length - 1]?.sortKey
      const current = optionTailRef.current.get(fieldId)
      if (dataTail && (!current || compareSortKeys(dataTail, current) > 0)) {
        optionTailRef.current.set(fieldId, dataTail)
      }
    }
  }, [optionsByField])

  const nextAppendKey = useCallback((tailRef: React.MutableRefObject<string | undefined>) => {
    const key = generateSortKeyWithJitter(tailRef.current, undefined)
    tailRef.current = key
    return key
  }, [])

  // ─── Undo scope: this database and everything in it ──────────────────────

  const undoScope = useMemo(
    () => [
      databaseId,
      ...fields.map((f) => f.id),
      ...views.map((v) => v.id),
      ...rows.map((r) => r.id)
    ],
    [databaseId, fields, views, rows]
  )
  const { undo, redo, canUndo, canRedo } = useUndoScope(undoScope, {
    localDID: (did as never) ?? null,
    options: { localOnly: true }
  })

  // ─── Cell/row mutations ───────────────────────────────────────────────────

  // Dynamic cell_ properties aren't part of the static schema type, so the
  // update payloads are cast through the loose record shape.
  const updateRowProps = useCallback(
    async (rowId: string, properties: Record<string, unknown>): Promise<void> => {
      await mutate.update(DatabaseRowSchema, rowId, properties as never)
    },
    [mutate]
  )

  const updateCell = useCallback(
    async (rowId: string, fieldId: string, value: CellValue): Promise<void> => {
      await updateRowProps(rowId, { [cellKey(fieldId)]: value })
    },
    [updateRowProps]
  )

  const clearCells = useCallback(
    async (cells: Array<{ rowId: string; fieldId: string }>): Promise<void> => {
      const byRow = new Map<string, Record<string, unknown>>()
      for (const { rowId, fieldId } of cells) {
        const props = byRow.get(rowId) ?? {}
        props[cellKey(fieldId)] = null
        byRow.set(rowId, props)
      }
      await Promise.all([...byRow.entries()].map(([rowId, props]) => updateRowProps(rowId, props)))
    },
    [updateRowProps]
  )

  const addRow = useCallback(
    async (afterRowId?: string, cells?: Record<string, CellValue>): Promise<string | null> => {
      // Position among rows in sortKey order (manual order, not view sort)
      let sortKey: string
      if (afterRowId) {
        const bySortKey = [...rows].sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
        const index = bySortKey.findIndex((r) => r.id === afterRowId)
        if (index >= 0) {
          sortKey = generateSortKeyWithJitter(
            bySortKey[index].sortKey,
            bySortKey[index + 1]?.sortKey
          )
        } else {
          sortKey = nextAppendKey(rowTailRef)
        }
      } else {
        sortKey = nextAppendKey(rowTailRef)
      }

      const cellProps: Record<string, unknown> = {}
      for (const [fieldId, value] of Object.entries(cells ?? {})) {
        cellProps[cellKey(fieldId)] = value
      }

      const node = await mutate.create(DatabaseRowSchema, {
        database: databaseId,
        sortKey,
        ...cellProps
      } as never)
      return node?.id ?? null
    },
    [mutate, databaseId, rows, nextAppendKey]
  )

  const deleteRows = useCallback(
    async (rowIds: string[]): Promise<void> => {
      await Promise.all(rowIds.map((id) => mutate.remove(id)))
    },
    [mutate]
  )

  const moveRowToIndex = useCallback(
    async (rowId: string, targetIndex: number): Promise<void> => {
      // Manual reorder is only meaningful without an active view sort
      if (activeView && activeView.sorts.length > 0) return
      const ordered = rows.map((r) => ({ id: r.id, key: r.sortKey }))
      const sortKey = dropSortKey(ordered, rowId, targetIndex)
      await updateRowProps(rowId, { sortKey })
    },
    [rows, activeView, updateRowProps]
  )

  // ─── Field mutations ──────────────────────────────────────────────────────

  const addField = useCallback(
    async (name: string, type: FieldType, config?: FieldConfig): Promise<string | null> => {
      const node = await mutate.create(DatabaseFieldSchema, {
        database: databaseId,
        name,
        type,
        config: (config ?? {}) as Record<string, unknown>,
        sortKey: nextAppendKey(fieldTailRef)
      })
      return node?.id ?? null
    },
    [mutate, databaseId, nextAppendKey]
  )

  const renameField = useCallback(
    async (fieldId: string, name: string): Promise<void> => {
      await mutate.update(DatabaseFieldSchema, fieldId, { name })
    },
    [mutate]
  )

  const updateFieldConfig = useCallback(
    async (fieldId: string, config: FieldConfig): Promise<void> => {
      await mutate.update(DatabaseFieldSchema, fieldId, {
        config: config as Record<string, unknown>
      })
    },
    [mutate]
  )

  const changeFieldType = useCallback(
    async (fieldId: string, type: FieldType): Promise<void> => {
      await mutate.update(DatabaseFieldSchema, fieldId, { type })
    },
    [mutate]
  )

  const removeField = useCallback(
    async (fieldId: string): Promise<void> => {
      const orphanedOptions = optionsByField.get(fieldId) ?? []
      await Promise.all(orphanedOptions.map((o) => mutate.remove(o.id)))
      await mutate.remove(fieldId)
    },
    [mutate, optionsByField]
  )

  const moveFieldToIndex = useCallback(
    async (fieldId: string, targetIndex: number): Promise<void> => {
      if (!activeView) return
      // Per-view order override (Notion semantics): write into fieldOrder
      const ordered = visibleFields.map((f) => ({
        id: f.id,
        key: activeView.fieldOrder[f.id] ?? fields.find((x) => x.id === f.id)?.sortKey ?? ''
      }))
      const newKey = dropSortKey(ordered, fieldId, targetIndex)
      await mutate.update(DatabaseViewSchema, activeView.id, {
        fieldOrder: { ...activeView.fieldOrder, [fieldId]: newKey }
      })
    },
    [mutate, activeView, visibleFields, fields]
  )

  const resizeField = useCallback(
    async (fieldId: string, width: number): Promise<void> => {
      if (!activeView) return
      await mutate.update(DatabaseViewSchema, activeView.id, {
        fieldWidths: { ...activeView.fieldWidths, [fieldId]: width }
      })
    },
    [mutate, activeView]
  )

  const setFieldHiddenInView = useCallback(
    async (fieldId: string, hidden: boolean): Promise<void> => {
      if (!activeView) return
      const set = new Set(activeView.hiddenFields)
      if (hidden) set.add(fieldId)
      else set.delete(fieldId)
      await mutate.update(DatabaseViewSchema, activeView.id, { hiddenFields: [...set] })
    },
    [mutate, activeView]
  )

  // ─── Select options ───────────────────────────────────────────────────────

  const createOption = useCallback(
    async (fieldId: string, name: string): Promise<string | null> => {
      const existing = optionsByField.get(fieldId) ?? []
      const match = existing.find((o) => o.name.toLowerCase() === name.toLowerCase())
      if (match) return match.id
      const tail = optionTailRef.current.get(fieldId)
      const sortKey = generateSortKeyWithJitter(tail, undefined)
      optionTailRef.current.set(fieldId, sortKey)
      const node = await mutate.create(DatabaseSelectOptionSchema, {
        field: fieldId,
        database: databaseId,
        name,
        color: autoColor(name),
        sortKey
      })
      return node?.id ?? null
    },
    [mutate, databaseId, optionsByField]
  )

  // ─── View mutations ───────────────────────────────────────────────────────

  const toggleSort = useCallback(
    async (fieldId: string): Promise<void> => {
      if (!activeView) return
      const current = activeView.sorts.find((s) => s.columnId === fieldId)
      let sorts: SortConfig[]
      if (!current) {
        sorts = [{ columnId: fieldId, direction: 'asc' }]
      } else if (current.direction === 'asc') {
        sorts = [{ columnId: fieldId, direction: 'desc' }]
      } else {
        sorts = []
      }
      await mutate.update(DatabaseViewSchema, activeView.id, { sorts })
    },
    [mutate, activeView]
  )

  const setFilters = useCallback(
    async (filters: FilterGroup | null): Promise<void> => {
      if (!activeView) return
      await mutate.update(DatabaseViewSchema, activeView.id, { filters: filters as never })
    },
    [mutate, activeView]
  )

  const setGroupBy = useCallback(
    async (fieldId: string | null): Promise<void> => {
      if (!activeView) return
      await mutate.update(DatabaseViewSchema, activeView.id, { groupBy: fieldId ?? undefined })
    },
    [mutate, activeView]
  )

  const addView = useCallback(
    async (name: string, type: ViewType): Promise<string | null> => {
      const node = await mutate.create(DatabaseViewSchema, {
        database: databaseId,
        name,
        type,
        sortKey: nextAppendKey(viewTailRef)
      })
      return node?.id ?? null
    },
    [mutate, databaseId, nextAppendKey]
  )

  const renameView = useCallback(
    async (id: string, name: string): Promise<void> => {
      await mutate.update(DatabaseViewSchema, id, { name })
    },
    [mutate]
  )

  const removeView = useCallback(
    async (id: string): Promise<void> => {
      await mutate.remove(id)
    },
    [mutate]
  )

  return {
    database: database ? { id: databaseId, ...(database as object) } : null,
    fields,
    visibleFields,
    views,
    activeView,
    rows,
    loading,
    updateCell,
    clearCells,
    addRow,
    deleteRows,
    moveRowToIndex,
    addField,
    renameField,
    updateFieldConfig,
    changeFieldType,
    removeField,
    moveFieldToIndex,
    resizeField,
    setFieldHidden: setFieldHiddenInView,
    createOption,
    toggleSort,
    setFilters,
    setGroupBy,
    addView,
    renameView,
    removeView,
    undo,
    redo,
    canUndo,
    canRedo
  }
}
