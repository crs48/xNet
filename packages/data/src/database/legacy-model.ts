/**
 * Legacy database model compatibility helpers.
 *
 * Legacy database surfaces stored columns, rows, and view config blobs inside
 * one `data` Y.Map on the database document. The hook layer uses these
 * helpers to read and write that shape during the Step 4 convergence window.
 */

import type { CellValue } from './cell-types'
import type { ColumnConfig, ColumnDefinition, ColumnType } from './column-types'
import type { FilterCondition, FilterGroup, SortConfig, ViewConfig, ViewType } from './view-types'
import { nanoid } from 'nanoid'
import * as Y from 'yjs'

export type DatabaseDocumentModel = 'canonical' | 'legacy' | 'mixed' | 'empty'

type LegacySelectOption = {
  id: string
  name?: string
  label?: string
  color?: string
}

type LegacyFilter = {
  id?: string
  propertyId?: string
  columnId?: string
  operator?: string
  value?: unknown
}

type LegacyFilterGroup = {
  type?: 'and' | 'or'
  operator?: 'and' | 'or'
  filters?: LegacyFilter[]
  conditions?: Array<LegacyFilter | LegacyFilterGroup>
}

type LegacySortConfig = {
  propertyId?: string
  columnId?: string
  direction?: 'asc' | 'desc'
}

type LegacyViewConfig = {
  id?: string
  name?: string
  type?: ViewType
  visibleProperties?: string[]
  visibleColumns?: string[]
  propertyWidths?: Record<string, number>
  columnWidths?: Record<string, number>
  sorts?: LegacySortConfig[]
  filter?: LegacyFilterGroup | null
  filters?: FilterGroup | null
  groupByProperty?: string
  groupBy?: string | null
  coverProperty?: string
  coverColumn?: string
  dateProperty?: string
  dateColumn?: string
  endDateProperty?: string
  endDateColumn?: string
}

type LegacyStoredColumn = {
  id: string
  name: string
  type: ColumnType
  config?: ColumnConfig | Record<string, unknown>
  width?: number
  isTitle?: boolean
}

type LegacyRow = {
  id: string
  [key: string]: unknown
}

export interface LegacyDatabaseRow {
  id: string
  sortKey: string
  cells: Record<string, CellValue>
  createdAt: number
  createdBy: string
}

const LEGACY_VIEW_KEYS = [
  'tableView',
  'boardView',
  'listView',
  'galleryView',
  'calendarView',
  'timelineView'
] as const

function getLegacyDataMap(doc: Y.Doc): Y.Map<unknown> | null {
  const dataMap = doc.getMap('data')
  return dataMap.size > 0 ? dataMap : null
}

function ensureLegacyDataMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('data')
}

function hasLegacySchemaState(doc: Y.Doc): boolean {
  const dataMap = getLegacyDataMap(doc)
  if (!dataMap) return false

  return dataMap.has('columns') || LEGACY_VIEW_KEYS.some((key) => dataMap.has(key))
}

function hasCanonicalSchemaState(doc: Y.Doc): boolean {
  const columns = doc.share.get('columns')
  const views = doc.share.get('views')

  return (
    (columns instanceof Y.Array && columns.length > 0) || (views instanceof Y.Map && views.size > 0)
  )
}

function normalizeSelectOptions(
  config: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!config || !Array.isArray(config.options)) {
    return config ?? {}
  }

  return {
    ...config,
    options: (config.options as LegacySelectOption[]).map((option) => ({
      id: option.id,
      name: option.name ?? option.label ?? option.id,
      color: option.color
    }))
  }
}

function normalizeLegacyColumn(column: LegacyStoredColumn): ColumnDefinition {
  return {
    id: column.id,
    name: column.name,
    type: column.type,
    config: normalizeSelectOptions(column.config as Record<string, unknown> | undefined),
    ...(column.width !== undefined ? { width: column.width } : {}),
    ...(column.isTitle !== undefined ? { isTitle: column.isTitle } : {})
  }
}

function mapLegacySort(sort: LegacySortConfig): SortConfig | null {
  const columnId = sort.columnId ?? sort.propertyId
  if (!columnId) return null

  return {
    columnId,
    direction: sort.direction === 'desc' ? 'desc' : 'asc'
  }
}

function mapLegacyFilterCondition(filter: LegacyFilter): FilterCondition | null {
  const columnId = filter.columnId ?? filter.propertyId
  const operator = filter.operator
  if (!columnId || !operator) return null

  return {
    columnId,
    operator: operator as FilterCondition['operator'],
    value: filter.value
  }
}

function mapLegacyFilterGroup(filter: LegacyFilterGroup | null | undefined): FilterGroup | null {
  if (!filter) return null

  if (Array.isArray(filter.conditions)) {
    const conditions: Array<FilterCondition | FilterGroup> = []

    for (const entry of filter.conditions) {
      if ('conditions' in entry || 'filters' in entry) {
        const nested = mapLegacyFilterGroup(entry as LegacyFilterGroup)
        if (nested) {
          conditions.push(nested)
        }
        continue
      }

      const mapped = mapLegacyFilterCondition(entry as LegacyFilter)
      if (mapped) {
        conditions.push(mapped)
      }
    }

    return {
      operator: filter.operator ?? filter.type ?? 'and',
      conditions
    }
  }

  return {
    operator: filter.operator ?? filter.type ?? 'and',
    conditions: (filter.filters ?? [])
      .map((entry) => mapLegacyFilterCondition(entry))
      .filter((entry): entry is FilterCondition => entry !== null)
  }
}

function mapLegacyView(view: LegacyViewConfig, fallbackType: ViewType): ViewConfig {
  return {
    id: view.id ?? `legacy-${fallbackType}`,
    name: view.name ?? `${fallbackType[0].toUpperCase()}${fallbackType.slice(1)} View`,
    type: view.type ?? fallbackType,
    visibleColumns: view.visibleColumns ?? view.visibleProperties ?? [],
    ...((view.columnWidths ?? view.propertyWidths)
      ? { columnWidths: view.columnWidths ?? view.propertyWidths }
      : {}),
    sorts: (view.sorts ?? [])
      .map((sort) => mapLegacySort(sort))
      .filter((sort): sort is SortConfig => sort !== null),
    filters: view.filters ?? mapLegacyFilterGroup(view.filter),
    ...((view.groupBy ?? view.groupByProperty)
      ? { groupBy: view.groupBy ?? view.groupByProperty ?? null }
      : {}),
    ...((view.coverColumn ?? view.coverProperty)
      ? { coverColumn: view.coverColumn ?? view.coverProperty }
      : {}),
    ...((view.dateColumn ?? view.dateProperty)
      ? { dateColumn: view.dateColumn ?? view.dateProperty }
      : {}),
    ...((view.endDateColumn ?? view.endDateProperty)
      ? { endDateColumn: view.endDateColumn ?? view.endDateProperty }
      : {})
  }
}

function mapFilterForLegacyView(filter: FilterGroup | null | undefined): LegacyFilterGroup | null {
  if (!filter) return null

  return {
    type: filter.operator,
    filters: filter.conditions.flatMap((condition) => {
      if ('conditions' in condition) {
        return []
      }

      return [
        {
          propertyId: condition.columnId,
          operator: condition.operator,
          value: condition.value
        }
      ]
    })
  }
}

function mapViewToLegacy(view: Omit<ViewConfig, 'id'> & { id?: string }): LegacyViewConfig {
  return {
    ...(view.id ? { id: view.id } : {}),
    name: view.name,
    type: view.type,
    visibleProperties: view.visibleColumns,
    ...(view.columnWidths ? { propertyWidths: view.columnWidths } : {}),
    sorts: (view.sorts ?? []).map((sort) => ({
      propertyId: sort.columnId,
      direction: sort.direction
    })),
    filter: mapFilterForLegacyView(view.filters),
    ...(view.groupBy ? { groupByProperty: view.groupBy } : {}),
    ...(view.coverColumn ? { coverProperty: view.coverColumn } : {}),
    ...(view.dateColumn ? { dateProperty: view.dateColumn } : {}),
    ...(view.endDateColumn ? { endDateProperty: view.endDateColumn } : {})
  }
}

function getLegacyViewKey(viewType: ViewType): (typeof LEGACY_VIEW_KEYS)[number] {
  switch (viewType) {
    case 'table':
      return 'tableView'
    case 'board':
      return 'boardView'
    case 'list':
      return 'listView'
    case 'gallery':
      return 'galleryView'
    case 'calendar':
      return 'calendarView'
    case 'timeline':
      return 'timelineView'
  }
}

function getLegacyViewKeyById(
  doc: Y.Doc,
  viewId: string
): (typeof LEGACY_VIEW_KEYS)[number] | null {
  const dataMap = getLegacyDataMap(doc)
  if (!dataMap) return null

  for (const key of LEGACY_VIEW_KEYS) {
    const view = dataMap.get(key) as LegacyViewConfig | undefined
    if (view?.id === viewId) {
      return key
    }
  }

  return null
}

export function getDatabaseDocumentModel(doc: Y.Doc): DatabaseDocumentModel {
  const hasLegacy = hasLegacySchemaState(doc)
  const hasCanonical = hasCanonicalSchemaState(doc)

  if (hasLegacy && hasCanonical) return 'mixed'
  if (hasLegacy) return 'legacy'
  if (doc.share.has('columns') || doc.share.has('views') || doc.share.has('meta'))
    return 'canonical'
  return 'empty'
}

export function prefersLegacyDatabaseModel(doc: Y.Doc): boolean {
  const model = getDatabaseDocumentModel(doc)
  return model === 'legacy'
}

export function hasLegacyRows(doc: Y.Doc): boolean {
  const dataMap = getLegacyDataMap(doc)
  const rows = dataMap?.get('rows')
  return Array.isArray(rows) && rows.length > 0
}

export function getLegacyColumns(doc: Y.Doc): ColumnDefinition[] {
  const dataMap = getLegacyDataMap(doc)
  const columns = dataMap?.get('columns')

  if (!Array.isArray(columns)) {
    return []
  }

  return columns.map((column) => normalizeLegacyColumn(column as LegacyStoredColumn))
}

export function getLegacyViews(doc: Y.Doc): ViewConfig[] {
  const dataMap = getLegacyDataMap(doc)
  if (!dataMap) return []

  return LEGACY_VIEW_KEYS.flatMap((key) => {
    const raw = dataMap.get(key) as LegacyViewConfig | undefined
    if (!raw) return []

    return [mapLegacyView(raw, key.replace('View', '') as ViewType)]
  })
}

export function getLegacyRows(doc: Y.Doc): LegacyDatabaseRow[] {
  const dataMap = getLegacyDataMap(doc)
  const rows = dataMap?.get('rows')

  if (!Array.isArray(rows)) {
    return []
  }

  return rows.flatMap((row, index) => {
    const record = row as LegacyRow
    if (!record.id) return []

    const cells = Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== 'id')
    ) as Record<string, CellValue>

    return [
      {
        id: record.id,
        sortKey: `legacy:${String(index).padStart(8, '0')}`,
        cells,
        createdAt: 0,
        createdBy: ''
      }
    ]
  })
}

export function createLegacyColumn(doc: Y.Doc, definition: Omit<ColumnDefinition, 'id'>): string {
  const dataMap = ensureLegacyDataMap(doc)
  const currentColumns = (dataMap.get('columns') as LegacyStoredColumn[] | undefined) ?? []
  const id = nanoid()

  const nextColumn: LegacyStoredColumn = {
    id,
    name: definition.name,
    type: definition.type,
    config: definition.config,
    ...(definition.width !== undefined ? { width: definition.width } : {}),
    ...(definition.isTitle !== undefined ? { isTitle: definition.isTitle } : {})
  }

  doc.transact(() => {
    dataMap.set('columns', [...currentColumns, nextColumn])

    for (const key of LEGACY_VIEW_KEYS) {
      const rawView = dataMap.get(key) as LegacyViewConfig | undefined
      if (!rawView) continue

      const visibleProperties = rawView.visibleProperties ?? rawView.visibleColumns ?? []
      dataMap.set(key, {
        ...rawView,
        visibleProperties: [...visibleProperties, id]
      })
    }
  })

  return id
}

export function updateLegacyColumn(
  doc: Y.Doc,
  columnId: string,
  updates: Partial<Omit<ColumnDefinition, 'id'>>
): void {
  const dataMap = ensureLegacyDataMap(doc)
  const currentColumns = (dataMap.get('columns') as LegacyStoredColumn[] | undefined) ?? []

  doc.transact(() => {
    dataMap.set(
      'columns',
      currentColumns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              ...(updates.name !== undefined ? { name: updates.name } : {}),
              ...(updates.type !== undefined ? { type: updates.type } : {}),
              ...(updates.config !== undefined ? { config: updates.config } : {}),
              ...(updates.width !== undefined ? { width: updates.width } : {}),
              ...(updates.isTitle !== undefined ? { isTitle: updates.isTitle } : {})
            }
          : column
      )
    )
  })
}

export function deleteLegacyColumn(doc: Y.Doc, columnId: string): void {
  const dataMap = ensureLegacyDataMap(doc)
  const currentColumns = (dataMap.get('columns') as LegacyStoredColumn[] | undefined) ?? []

  doc.transact(() => {
    dataMap.set(
      'columns',
      currentColumns.filter((column) => column.id !== columnId)
    )

    for (const key of LEGACY_VIEW_KEYS) {
      const rawView = dataMap.get(key) as LegacyViewConfig | undefined
      if (!rawView) continue

      const visibleProperties = rawView.visibleProperties ?? rawView.visibleColumns ?? []
      dataMap.set(key, {
        ...rawView,
        visibleProperties: visibleProperties.filter((id) => id !== columnId)
      })
    }
  })
}

export function reorderLegacyColumn(doc: Y.Doc, columnId: string, newIndex: number): void {
  const dataMap = ensureLegacyDataMap(doc)
  const currentColumns = (dataMap.get('columns') as LegacyStoredColumn[] | undefined) ?? []
  const currentIndex = currentColumns.findIndex((column) => column.id === columnId)

  if (currentIndex === -1) return

  const nextColumns = [...currentColumns]
  const [column] = nextColumns.splice(currentIndex, 1)
  const insertIndex = Math.max(0, Math.min(newIndex, nextColumns.length))
  nextColumns.splice(insertIndex, 0, column)

  doc.transact(() => {
    dataMap.set('columns', nextColumns)
  })
}

export function createLegacyView(doc: Y.Doc, config: Omit<ViewConfig, 'id'>): string {
  const dataMap = ensureLegacyDataMap(doc)
  const id = nanoid()

  doc.transact(() => {
    dataMap.set(getLegacyViewKey(config.type), mapViewToLegacy({ ...config, id }))
  })

  return id
}

export function updateLegacyView(
  doc: Y.Doc,
  viewId: string,
  updates: Partial<Omit<ViewConfig, 'id'>>
): void {
  const dataMap = ensureLegacyDataMap(doc)
  const key = getLegacyViewKeyById(doc, viewId)
  if (!key) return

  const current = dataMap.get(key) as LegacyViewConfig | undefined
  if (!current) return

  const next = mapViewToLegacy({
    ...mapLegacyView(current, key.replace('View', '') as ViewType),
    ...updates,
    id: viewId
  })

  doc.transact(() => {
    dataMap.set(key, next)
  })
}

export function deleteLegacyView(doc: Y.Doc, viewId: string): void {
  const dataMap = ensureLegacyDataMap(doc)
  const key = getLegacyViewKeyById(doc, viewId)
  if (!key) return

  doc.transact(() => {
    dataMap.delete(key)
  })
}

export function getLegacyView(doc: Y.Doc, viewId: string): ViewConfig | null {
  return getLegacyViews(doc).find((view) => view.id === viewId) ?? null
}

export function getLegacyColumn(doc: Y.Doc, columnId: string): ColumnDefinition | null {
  return getLegacyColumns(doc).find((column) => column.id === columnId) ?? null
}

export function createLegacyRow(
  doc: Y.Doc,
  cells: Record<string, CellValue>,
  options: { beforeId?: string; afterId?: string } = {}
): string {
  const dataMap = ensureLegacyDataMap(doc)
  const currentRows = (dataMap.get('rows') as LegacyRow[] | undefined) ?? []
  const id = nanoid()
  const nextRow: LegacyRow = { id, ...cells }

  let insertIndex = currentRows.length

  if (options.beforeId) {
    const beforeIndex = currentRows.findIndex((row) => row.id === options.beforeId)
    if (beforeIndex !== -1) {
      insertIndex = beforeIndex
    }
  } else if (options.afterId) {
    const afterIndex = currentRows.findIndex((row) => row.id === options.afterId)
    if (afterIndex !== -1) {
      insertIndex = afterIndex + 1
    }
  }

  doc.transact(() => {
    dataMap.set('rows', [
      ...currentRows.slice(0, insertIndex),
      nextRow,
      ...currentRows.slice(insertIndex)
    ])
  })

  return id
}

export function updateLegacyRow(doc: Y.Doc, rowId: string, cells: Record<string, CellValue>): void {
  const dataMap = ensureLegacyDataMap(doc)
  const currentRows = (dataMap.get('rows') as LegacyRow[] | undefined) ?? []

  doc.transact(() => {
    dataMap.set(
      'rows',
      currentRows.map((row) => (row.id === rowId ? { ...row, ...cells } : row))
    )
  })
}

export function deleteLegacyRow(doc: Y.Doc, rowId: string): void {
  const dataMap = ensureLegacyDataMap(doc)
  const currentRows = (dataMap.get('rows') as LegacyRow[] | undefined) ?? []

  doc.transact(() => {
    dataMap.set(
      'rows',
      currentRows.filter((row) => row.id !== rowId)
    )
  })
}

export function moveLegacyRow(
  doc: Y.Doc,
  rowId: string,
  options: { beforeId?: string; afterId?: string }
): void {
  const dataMap = ensureLegacyDataMap(doc)
  const currentRows = (dataMap.get('rows') as LegacyRow[] | undefined) ?? []
  const currentIndex = currentRows.findIndex((row) => row.id === rowId)

  if (currentIndex === -1) return

  const nextRows = [...currentRows]
  const [row] = nextRows.splice(currentIndex, 1)

  let insertIndex = nextRows.length
  if (options.beforeId) {
    const beforeIndex = nextRows.findIndex((entry) => entry.id === options.beforeId)
    if (beforeIndex !== -1) {
      insertIndex = beforeIndex
    }
  } else if (options.afterId) {
    const afterIndex = nextRows.findIndex((entry) => entry.id === options.afterId)
    if (afterIndex !== -1) {
      insertIndex = afterIndex + 1
    }
  }

  nextRows.splice(insertIndex, 0, row)

  doc.transact(() => {
    dataMap.set('rows', nextRows)
  })
}
