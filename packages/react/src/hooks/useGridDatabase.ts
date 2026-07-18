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
  type FormFieldRule,
  type FormSubmissionMeta,
  type FormViewConfig,
  type MapViewport,
  type SortConfig,
  type ViewGroupMeta,
  type ViewType,
  type RowHeight,
  type SummaryFunction,
  asRowHeight,
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
  generateSortKey,
  generateSortKeyWithJitter,
  sortRows,
  aggregate,
  convertCellValue,
  FormulaService,
  type RollupAggregation
} from '@xnetjs/data'
import type { QuerySpatialFilter } from '@xnetjs/data-bridge'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useIdentity } from './useIdentity'
import { useMutate } from './useMutate'
import { useNodeStore } from './useNodeStore'
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
  rowHeight: RowHeight
  columnSummaries: Record<string, SummaryFunction>
  sortKey: string
  // Form view (exploration 0278)
  formConfig: FormViewConfig | null
  formRules: Record<string, FormFieldRule>
  formAccepting: boolean
  // Board/Gallery/Calendar/Timeline/Map config (exploration 0337)
  coverField: string | null
  cardSize: string | null
  coverFit: string | null
  colorBy: string | null
  groupMeta: Record<string, ViewGroupMeta>
  dateField: string | null
  endDateField: string | null
  latField: string | null
  lngField: string | null
  mapViewport: MapViewport | null
}

/**
 * The per-view presentation config a view component may patch through
 * `setViewConfig` (exploration 0337). One node write per patch — each
 * property merges independently (LWW) with other clients' edits.
 */
export interface GridViewConfigPatch {
  groupBy?: string | null
  collapsedGroups?: string[]
  coverField?: string | null
  cardSize?: string | null
  coverFit?: string | null
  colorBy?: string | null
  groupMeta?: Record<string, ViewGroupMeta>
  dateField?: string | null
  endDateField?: string | null
  latField?: string | null
  lngField?: string | null
  mapViewport?: MapViewport | null
}

export interface GridRowModel {
  id: string
  sortKey: string
  cells: Record<string, CellValue>
}

/** Options for `addRow` (exploration 0278: form submissions). */
export interface AddRowOptions {
  /** Explicit node id — deterministic ids make retried submissions upsert. */
  id?: string
  /** Form-submission provenance stamped on the row. */
  meta?: FormSubmissionMeta
}

export interface UseGridDatabaseOptions {
  /** Active view ID (defaults to the first view) */
  viewId?: string
  /** Quick-find text (full-text search via SQLite FTS) */
  search?: string
  /** Row window size (default 500) */
  pageSize?: number
  /**
   * Spatial window over two cell properties (map views, exploration
   * 0337): only rows inside the rect are fetched. Bypasses the
   * materialized-view cache (the rect varies per pan).
   */
  spatial?: QuerySpatialFilter
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
  /**
   * The fetch window (exploration 0337): `size` is the row cap, `total`
   * the full match count when the bridge reports one. Views use this to
   * label truncation honestly instead of silently clipping.
   */
  rowWindow: { size: number; total: number | null }
  loading: boolean

  // Cell/row mutations
  updateCell: (rowId: string, fieldId: string, value: CellValue) => Promise<void>
  /**
   * Write several cells (and optionally the row's sortKey) as ONE node
   * update — a kanban card move is exactly one write carrying the group
   * cell + the fractional position (exploration 0337).
   */
  updateRowCells: (
    rowId: string,
    cells: Record<string, CellValue>,
    opts?: { sortKey?: string }
  ) => Promise<void>
  clearCells: (cells: Array<{ rowId: string; fieldId: string }>) => Promise<void>
  addRow: (
    afterRowId?: string,
    cells?: Record<string, CellValue>,
    opts?: AddRowOptions
  ) => Promise<string | null>
  deleteRows: (rowIds: string[]) => Promise<void>
  moveRowToIndex: (rowId: string, targetIndex: number) => Promise<void>

  // Field mutations
  addField: (
    name: string,
    type: FieldType,
    config?: FieldConfig,
    opts?: { isTitle?: boolean; width?: number }
  ) => Promise<string | null>
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
  /** Patch the active view's presentation config (exploration 0337) */
  setViewConfig: (patch: GridViewConfigPatch) => Promise<void>
  /** Persist a group's collapsed state on the active view */
  setGroupCollapsed: (groupKey: string, collapsed: boolean) => Promise<void>
  setRowHeight: (rowHeight: RowHeight) => Promise<void>
  setColumnSummary: (fieldId: string, fn: SummaryFunction) => Promise<void>
  // Form view (exploration 0278)
  setFormConfig: (config: FormViewConfig) => Promise<void>
  setFormRules: (rules: Record<string, FormFieldRule>) => Promise<void>
  setFormAccepting: (accepting: boolean) => Promise<void>
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
    rowHeight: asRowHeight(node.rowHeight as string | undefined),
    columnSummaries: (node.columnSummaries as Record<string, SummaryFunction> | undefined) ?? {},
    sortKey: (node.sortKey as string) ?? '',
    formConfig: (node.formConfig as FormViewConfig | undefined) ?? null,
    formRules: (node.formRules as Record<string, FormFieldRule> | undefined) ?? {},
    formAccepting: (node.formAccepting as boolean | undefined) ?? true,
    coverField: (node.coverField as string | undefined) ?? null,
    cardSize: (node.cardSize as string | undefined) ?? null,
    coverFit: (node.coverFit as string | undefined) ?? null,
    colorBy: (node.colorBy as string | undefined) ?? null,
    groupMeta: (node.groupMeta as Record<string, ViewGroupMeta> | undefined) ?? {},
    dateField: (node.dateField as string | undefined) ?? null,
    endDateField: (node.endDateField as string | undefined) ?? null,
    latField: (node.latField as string | undefined) ?? null,
    lngField: (node.lngField as string | undefined) ?? null,
    mapViewport: (node.mapViewport as MapViewport | undefined) ?? null
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

// Shared formula evaluator (AST + value caches keyed by row/column hash)
const formulaService = new FormulaService()

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGridDatabase(
  databaseId: string,
  options: UseGridDatabaseOptions = {}
): UseGridDatabaseResult {
  const { viewId, search, pageSize = 500, spatial } = options
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

  const {
    data: rowNodes,
    status: rowStatus,
    totalCount: rowTotalCount
  } = useQuery(DatabaseRowSchema, {
    where: { database: databaseId },
    orderBy: { sortKey: 'asc' },
    limit: pageSize,
    ...(spatial
      ? { spatial }
      : { materializedView: `db:${databaseId}${viewId ? `:view:${viewId}` : ''}` }),
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

  // ─── Rollups (async — related rows live in other databases) ──────────────
  // Computed off the raw row nodes so the rows memo can merge results
  // without forming an effect loop.
  const { store } = useNodeStore()
  const [rollupValues, setRollupValues] = useState<Map<string, CellValue>>(new Map())

  useEffect(() => {
    const rollupFields = fields.filter((f) => f.type === 'rollup')
    if (rollupFields.length === 0 || !store) {
      setRollupValues((prev) => (prev.size > 0 ? new Map() : prev))
      return
    }
    let cancelled = false
    void (async () => {
      const next = new Map<string, CellValue>()
      const relatedCache = new Map<string, Record<string, CellValue> | null>()
      const nodes = (rowNodes ?? []) as unknown as Flat[]
      for (const field of rollupFields) {
        const config = field.config as {
          relationColumn?: string
          targetColumn?: string
          aggregation?: RollupAggregation
        }
        if (!config.relationColumn || !config.targetColumn || !config.aggregation) continue
        for (const node of nodes) {
          const cells = fromCellProperties(node)
          const raw = cells[config.relationColumn]
          const relatedIds = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : []
          const values: unknown[] = []
          for (const relatedId of relatedIds) {
            let related = relatedCache.get(relatedId)
            if (related === undefined) {
              const relatedNode = await store.get(relatedId)
              related =
                relatedNode && !relatedNode.deleted
                  ? fromCellProperties(relatedNode.properties)
                  : null
              relatedCache.set(relatedId, related)
            }
            if (related) values.push(related[config.targetColumn] ?? null)
          }
          next.set(`${node.id}:${field.id}`, aggregate(values, config.aggregation) as CellValue)
        }
      }
      if (!cancelled) setRollupValues(next)
    })()
    return () => {
      cancelled = true
    }
  }, [rowNodes, fields, store])

  const rows = useMemo(() => {
    // Auto fields read node metadata instead of stored cells
    const autoFields = fields.filter((f) =>
      ['created', 'createdBy', 'updated', 'updatedBy'].includes(f.type)
    )
    const base: GridRowModel[] = ((rowNodes ?? []) as unknown as Flat[]).map((node) => {
      const cells = fromCellProperties(node)
      for (const field of autoFields) {
        switch (field.type) {
          case 'created':
            cells[field.id] = node.createdAt
              ? new Date(node.createdAt as number).toISOString()
              : null
            break
          case 'createdBy':
            cells[field.id] = (node.createdBy as string) ?? null
            break
          case 'updated':
            cells[field.id] = node.updatedAt
              ? new Date(node.updatedAt as number).toISOString()
              : null
            break
          case 'updatedBy':
            // Last-writer attribution isn't on the flattened node yet
            cells[field.id] = null
            break
        }
      }
      return {
        id: node.id,
        sortKey: (node.sortKey as string) ?? '',
        cells
      }
    })

    // Formula fields evaluate from the row's other cells (cached per
    // row+column input hash), before filters/sorts so they can use the
    // computed values
    const formulaFields = fields.filter((f) => f.type === 'formula')
    if (formulaFields.length > 0) {
      const columnDefs = fieldsToColumnDefinitions(fields)
      for (const row of base) {
        for (const field of formulaFields) {
          const columnDef = columnDefs.find((c) => c.id === field.id)
          if (!columnDef) continue
          try {
            row.cells[field.id] = formulaService.compute(
              { id: row.id, databaseId, cells: row.cells },
              columnDef,
              columnDefs
            ) as CellValue
          } catch {
            row.cells[field.id] = null
          }
        }
      }
    }
    // Rollup values merge from the async computation
    if (rollupValues.size > 0) {
      for (const row of base) {
        for (const field of fields) {
          if (field.type !== 'rollup') continue
          const computed = rollupValues.get(`${row.id}:${field.id}`)
          if (computed !== undefined) row.cells[field.id] = computed
        }
      }
    }

    // Fractional-index comparator is the final ordering authority
    base.sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
    if (!activeView) return base
    const columns = fieldsToColumnDefinitions(fields)
    const filtered = filterRows(base, columns, activeView.filters)
    return sortRows(filtered, columns, activeView.sorts)
  }, [rowNodes, activeView, fields, databaseId, rollupValues])

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
    // Appends chain off the local tail, so they stay strictly monotonic
    // without jitter (jitter is for concurrent same-position inserts,
    // which appends are not — two clients appending diverge by their own
    // tails either way)
    const key = generateSortKey(tailRef.current, undefined)
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

  const updateRowCells = useCallback(
    async (
      rowId: string,
      cells: Record<string, CellValue>,
      opts?: { sortKey?: string }
    ): Promise<void> => {
      const props: Record<string, unknown> = {}
      for (const [fieldId, value] of Object.entries(cells)) {
        props[cellKey(fieldId)] = value
      }
      if (opts?.sortKey !== undefined) props.sortKey = opts.sortKey
      await updateRowProps(rowId, props)
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
    async (
      afterRowId?: string,
      cells?: Record<string, CellValue>,
      opts?: AddRowOptions
    ): Promise<string | null> => {
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

      const node = await mutate.create(
        DatabaseRowSchema,
        {
          database: databaseId,
          sortKey,
          ...(opts?.meta ? { submissionMeta: opts.meta } : {}),
          ...cellProps
        } as never,
        opts?.id
      )
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

  // ─── Field mutations ──────────────────────────────────────────────────────

  const addField = useCallback(
    async (
      name: string,
      type: FieldType,
      config?: FieldConfig,
      opts?: { isTitle?: boolean; width?: number }
    ): Promise<string | null> => {
      const node = await mutate.create(DatabaseFieldSchema, {
        database: databaseId,
        name,
        type,
        config: (config ?? {}) as Record<string, unknown>,
        sortKey: nextAppendKey(fieldTailRef),
        ...(opts?.isTitle !== undefined ? { isTitle: opts.isTitle } : {}),
        ...(opts?.width !== undefined ? { width: opts.width } : {})
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
      const field = fields.find((f) => f.id === fieldId)
      const sourceType = field?.type ?? 'text'
      await mutate.update(DatabaseFieldSchema, fieldId, { type })
      if (!field || sourceType === type) return

      // Convert existing cell values to the new type. Select-ish targets
      // get their distinct names persisted as option nodes first.
      const ctx = {
        optionName: (id: string) => field.options?.find((o) => o.id === id)?.name
      }
      const conversions = rows.map((row) => ({
        row,
        converted: convertCellValue(row.cells[fieldId] ?? null, sourceType, type, ctx)
      }))

      const nameToId = new Map<string, string>()
      if (type === 'select' || type === 'multiSelect') {
        const allNames = new Set<string>()
        for (const { converted } of conversions) {
          converted.optionNames?.forEach((n) => allNames.add(n))
        }
        for (const name of allNames) {
          const optionId = await createOption(fieldId, name)
          if (optionId) nameToId.set(name.toLowerCase(), optionId)
        }
      }

      for (const { row, converted } of conversions) {
        const before = row.cells[fieldId] ?? null
        let next = converted.value
        if (converted.optionNames && converted.optionNames.length > 0) {
          const ids = converted.optionNames
            .map((n) => nameToId.get(n.toLowerCase()))
            .filter((id): id is string => Boolean(id))
          next = type === 'multiSelect' ? ids : (ids[0] ?? null)
        }
        if (before === null && next === null) continue
        await updateRowProps(row.id, { [cellKey(fieldId)]: next })
      }
    },
    [mutate, fields, rows, createOption, updateRowProps]
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

  const setViewConfig = useCallback(
    async (patch: GridViewConfigPatch): Promise<void> => {
      if (!activeView) return
      // null clears a field (LWW tombstone); undefined keys are omitted
      const props: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) props[key] = value
      }
      if (Object.keys(props).length === 0) return
      await mutate.update(DatabaseViewSchema, activeView.id, props as never)
    },
    [mutate, activeView]
  )

  const setGroupCollapsed = useCallback(
    async (groupKey: string, collapsed: boolean): Promise<void> => {
      if (!activeView) return
      const set = new Set(activeView.collapsedGroups)
      if (collapsed) set.add(groupKey)
      else set.delete(groupKey)
      await mutate.update(DatabaseViewSchema, activeView.id, { collapsedGroups: [...set] })
    },
    [mutate, activeView]
  )

  const setRowHeight = useCallback(
    async (rowHeight: RowHeight): Promise<void> => {
      if (!activeView) return
      await mutate.update(DatabaseViewSchema, activeView.id, { rowHeight })
    },
    [mutate, activeView]
  )

  const setColumnSummary = useCallback(
    async (fieldId: string, fn: SummaryFunction): Promise<void> => {
      if (!activeView) return
      const next = { ...activeView.columnSummaries }
      if (fn === 'none') delete next[fieldId]
      else next[fieldId] = fn
      await mutate.update(DatabaseViewSchema, activeView.id, { columnSummaries: next as never })
    },
    [mutate, activeView]
  )

  // Form view mutations (exploration 0278): whole-value LWW commits, like
  // filters — each json prop is one intentional unit.
  const setFormConfig = useCallback(
    async (config: FormViewConfig): Promise<void> => {
      if (!activeView) return
      await mutate.update(DatabaseViewSchema, activeView.id, { formConfig: config as never })
    },
    [mutate, activeView]
  )

  const setFormRules = useCallback(
    async (rules: Record<string, FormFieldRule>): Promise<void> => {
      if (!activeView) return
      await mutate.update(DatabaseViewSchema, activeView.id, { formRules: rules as never })
    },
    [mutate, activeView]
  )

  const setFormAccepting = useCallback(
    async (accepting: boolean): Promise<void> => {
      if (!activeView) return
      await mutate.update(DatabaseViewSchema, activeView.id, { formAccepting: accepting })
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
    rowWindow: { size: pageSize, total: rowTotalCount ?? null },
    loading,
    updateCell,
    updateRowCells,
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
    setViewConfig,
    setGroupCollapsed,
    setRowHeight,
    setColumnSummary,
    setFormConfig,
    setFormRules,
    setFormAccepting,
    addView,
    renameView,
    removeView,
    undo,
    redo,
    canUndo,
    canRedo
  }
}
