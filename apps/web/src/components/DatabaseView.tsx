/**
 * Database View - Table/Board surface driven by the shared database hooks.
 */

import type {
  CellValue,
  ColumnDefinition,
  PropertyDefinition,
  PropertyType,
  Schema,
  ViewConfig as DataViewConfig
} from '@xnetjs/data'
import type {
  CellPresence,
  FilterOperator as SurfaceFilterOperator,
  TableRow,
  ViewConfig as SurfaceViewConfig
} from '@xnetjs/views'
import { DatabaseSchema } from '@xnetjs/data'
import { useDatabase, useDatabaseDoc, useIdentity, useNode } from '@xnetjs/react'
import { BoardView, CardDetailModal, TableView } from '@xnetjs/views'
import { LayoutGrid, Plus, Table } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PresenceAvatars } from './PresenceAvatars'
import { ShareButton } from './ShareButton'

interface DatabaseViewProps {
  docId: string
}

type ViewMode = 'table' | 'board'

const SURFACE_FILTER_OPERATORS = new Set([
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'greaterThan',
  'lessThan',
  'greaterOrEqual',
  'lessOrEqual',
  'isEmpty',
  'isNotEmpty',
  'before',
  'after',
  'between'
])

const DEFAULT_COLUMNS: Array<Omit<ColumnDefinition, 'id'>> = [
  {
    name: 'Title',
    type: 'text',
    config: {},
    isTitle: true,
    width: 240
  },
  {
    name: 'Status',
    type: 'select',
    config: {
      options: [
        { id: 'todo', name: 'To Do', color: 'gray' },
        { id: 'in-progress', name: 'In Progress', color: 'blue' },
        { id: 'done', name: 'Done', color: 'green' }
      ]
    }
  },
  {
    name: 'Priority',
    type: 'select',
    config: {
      options: [
        { id: 'low', name: 'Low', color: 'gray' },
        { id: 'medium', name: 'Medium', color: 'yellow' },
        { id: 'high', name: 'High', color: 'red' }
      ]
    }
  },
  {
    name: 'Due Date',
    type: 'date',
    config: {}
  }
]

function toSurfaceViewConfig(view: DataViewConfig): SurfaceViewConfig {
  return {
    id: view.id,
    name: view.name,
    type: view.type,
    visibleProperties: view.visibleColumns,
    propertyWidths: view.columnWidths,
    sorts: (view.sorts ?? []).map((sort) => ({
      propertyId: sort.columnId,
      direction: sort.direction
    })),
    filter: view.filters
      ? {
          type: view.filters.operator,
          filters: view.filters.conditions.flatMap((condition) =>
            'conditions' in condition
              ? []
              : SURFACE_FILTER_OPERATORS.has(condition.operator)
                ? [
                    {
                      id: `${condition.columnId}:${condition.operator}`,
                      propertyId: condition.columnId,
                      operator: condition.operator as SurfaceFilterOperator,
                      value: condition.value
                    }
                  ]
                : []
          )
        }
      : undefined,
    groupByProperty: view.groupBy ?? undefined,
    coverProperty: view.coverColumn,
    dateProperty: view.dateColumn,
    endDateProperty: view.endDateColumn
  }
}

function toDataViewChanges(
  changes: Partial<SurfaceViewConfig>
): Partial<Omit<DataViewConfig, 'id'>> {
  return {
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.type !== undefined ? { type: changes.type } : {}),
    ...(changes.visibleProperties !== undefined
      ? { visibleColumns: changes.visibleProperties }
      : {}),
    ...(changes.propertyWidths !== undefined ? { columnWidths: changes.propertyWidths } : {}),
    ...(changes.sorts !== undefined
      ? {
          sorts: changes.sorts.map((sort) => ({
            columnId: sort.propertyId,
            direction: sort.direction
          }))
        }
      : {}),
    ...(changes.filter !== undefined
      ? {
          filters: changes.filter
            ? {
                operator: changes.filter.type,
                conditions: changes.filter.filters.map((filter) => ({
                  columnId: filter.propertyId,
                  operator: filter.operator,
                  value: filter.value
                }))
              }
            : null
        }
      : {}),
    ...(changes.groupByProperty !== undefined ? { groupBy: changes.groupByProperty } : {}),
    ...(changes.coverProperty !== undefined ? { coverColumn: changes.coverProperty } : {}),
    ...(changes.dateProperty !== undefined ? { dateColumn: changes.dateProperty } : {}),
    ...(changes.endDateProperty !== undefined ? { endDateColumn: changes.endDateProperty } : {})
  }
}

function buildSchema(columns: ColumnDefinition[]): Schema {
  const properties: PropertyDefinition[] = columns.map((column) => ({
    '@id': `xnet://xnet.fyi/DynamicDatabase#${column.id}`,
    name: column.name,
    type: column.type as PropertyType,
    required: false,
    config: column.config as Record<string, unknown>
  }))

  return {
    '@id': 'xnet://xnet.fyi/DynamicDatabase' as const,
    '@type': 'xnet://xnet.fyi/Schema' as const,
    name: 'DynamicDatabase',
    namespace: 'xnet://xnet.fyi/' as const,
    version: '1.0.0',
    properties
  }
}

function buildDefaultViews(columnIds: string[]): Array<Omit<DataViewConfig, 'id'>> {
  return [
    {
      name: 'Table View',
      type: 'table',
      visibleColumns: columnIds,
      columnWidths: Object.fromEntries(columnIds.map((columnId) => [columnId, 160])),
      sorts: []
    },
    {
      name: 'Board View',
      type: 'board',
      visibleColumns: columnIds,
      sorts: [],
      groupBy: columnIds[1] ?? columnIds[0] ?? null
    }
  ]
}

function flattenRows(rows: Array<{ id: string; cells: Record<string, CellValue> }>): TableRow[] {
  return rows.map((row) => ({
    id: row.id,
    ...row.cells
  }))
}

function getDefaultCellValue(column: ColumnDefinition): CellValue {
  switch (column.type) {
    case 'checkbox':
      return false
    case 'multiSelect':
    case 'relation':
      return []
    case 'number':
    case 'date':
    case 'dateRange':
    case 'select':
    case 'person':
    case 'file':
      return null
    default:
      return ''
  }
}

export function DatabaseView({ docId }: DatabaseViewProps) {
  const { did } = useIdentity()
  const {
    data: database,
    loading,
    update,
    presence,
    awareness
  } = useNode(DatabaseSchema, docId, {
    createIfMissing: { title: 'Untitled Database' },
    did: did ?? undefined
  })
  const {
    columns,
    views,
    loading: schemaLoading,
    createColumn,
    updateColumn,
    deleteColumn,
    createView,
    updateView
  } = useDatabaseDoc(docId)
  const { rows, loading: rowsLoading, createRow, updateRow, deleteRow } = useDatabase(docId)

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [cellPresences, setCellPresences] = useState<CellPresence[]>([])
  const bootstrappedRef = useRef(false)

  useEffect(() => {
    if (database?.defaultView === 'board') {
      setViewMode('board')
    }
  }, [database?.defaultView])

  useEffect(() => {
    if (schemaLoading || bootstrappedRef.current) return
    if (columns.length > 0 || views.length > 0) return

    bootstrappedRef.current = true

    const columnIds = DEFAULT_COLUMNS.map((definition) => createColumn(definition)).filter(
      (columnId): columnId is string => columnId !== null
    )

    if (columnIds.length === 0) {
      return
    }

    buildDefaultViews(columnIds).forEach((view) => {
      createView(view)
    })
  }, [columns.length, createColumn, createView, schemaLoading, views.length])

  useEffect(() => {
    if (!awareness) return

    const updatePresences = () => {
      const next: CellPresence[] = []
      awareness.getStates().forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId === awareness.clientID) return

        const user = state.user as { did?: string; color?: string; name?: string } | undefined
        const cell = state.cell as { rowId?: string; columnId?: string } | undefined
        if (!user?.did || !cell?.rowId || !cell?.columnId) return

        next.push({
          rowId: cell.rowId,
          columnId: cell.columnId,
          color: user.color ?? '#999999',
          did: user.did,
          name: user.name ?? 'Anonymous'
        })
      })

      setCellPresences(next)
    }

    awareness.on('change', updatePresences)
    updatePresences()

    return () => {
      awareness.off('change', updatePresences)
    }
  }, [awareness])

  const handleCellFocus = useCallback(
    (rowId: string, columnId: string) => {
      awareness?.setLocalStateField('cell', { rowId, columnId })
    },
    [awareness]
  )

  const handleCellBlur = useCallback(() => {
    awareness?.setLocalStateField('cell', null)
  }, [awareness])

  const handleAddRow = useCallback(async () => {
    const values = Object.fromEntries(
      columns.map((column) => [column.id, getDefaultCellValue(column)])
    ) as Record<string, CellValue>
    await createRow(values)
  }, [columns, createRow])

  const handleUpdateRow = useCallback(
    async (rowId: string, property: string, value: unknown) => {
      await updateRow(rowId, { [property]: value as CellValue })
    },
    [updateRow]
  )

  const handleDeleteRow = useCallback(
    async (rowId: string) => {
      await deleteRow(rowId)
    },
    [deleteRow]
  )

  const handleAddColumn = useCallback(() => {
    createColumn({
      name: 'New Column',
      type: 'text',
      config: {}
    })
  }, [createColumn])

  const handleUpdateColumn = useCallback(
    (
      columnId: string,
      updates: { name?: string; type?: string; config?: Record<string, unknown> }
    ) => {
      updateColumn(columnId, {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.type !== undefined ? { type: updates.type as ColumnDefinition['type'] } : {}),
        ...(updates.config !== undefined ? { config: updates.config } : {})
      })
    },
    [updateColumn]
  )

  const handleDeleteColumn = useCallback(
    (columnId: string) => {
      deleteColumn(columnId)
    },
    [deleteColumn]
  )

  const tableView = useMemo(() => views.find((view) => view.type === 'table') ?? null, [views])
  const boardView = useMemo(() => views.find((view) => view.type === 'board') ?? null, [views])

  const schema = useMemo(() => buildSchema(columns), [columns])
  const flatRows = useMemo(() => flattenRows(rows), [rows])
  const selectedRow = useMemo(
    () => flatRows.find((row) => row.id === selectedCardId) ?? null,
    [flatRows, selectedCardId]
  )

  const tableViewConfig = useMemo(
    () => (tableView ? toSurfaceViewConfig(tableView) : null),
    [tableView]
  )
  const boardViewConfig = useMemo(
    () => (boardView ? toSurfaceViewConfig(boardView) : null),
    [boardView]
  )

  const handleUpdateView = useCallback(
    (changes: Partial<SurfaceViewConfig>) => {
      const targetView = viewMode === 'table' ? tableView : boardView
      if (!targetView) return
      updateView(targetView.id, toDataViewChanges(changes))
    },
    [boardView, tableView, updateView, viewMode]
  )

  const handleCardClick = useCallback((rowId: string) => {
    setSelectedCardId(rowId)
  }, [])

  const handleCloseModal = useCallback(() => {
    setSelectedCardId(null)
  }, [])

  if (loading || schemaLoading || rowsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading database...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full -m-6">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary">
        <input
          type="text"
          className="text-lg font-semibold border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          value={database?.title || ''}
          onChange={(event) => update({ title: event.target.value })}
          placeholder="Untitled"
        />

        <div className="flex-1" />

        <PresenceAvatars presence={presence} />
        <ShareButton docId={docId} docType="database" />

        <div className="flex items-center border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
              viewMode === 'table'
                ? 'bg-primary text-white'
                : 'bg-transparent text-foreground hover:bg-accent'
            }`}
          >
            <Table size={14} />
            <span>Table</span>
          </button>
          <button
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
              viewMode === 'board'
                ? 'bg-primary text-white'
                : 'bg-transparent text-foreground hover:bg-accent'
            }`}
          >
            <LayoutGrid size={14} />
            <span>Board</span>
          </button>
        </div>

        <button
          onClick={() => {
            void handleAddRow()
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-md text-sm hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          <span>Add Row</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {viewMode === 'table' && tableViewConfig && (
          <TableView
            schema={schema}
            view={tableViewConfig}
            data={flatRows}
            onUpdateRow={(rowId, property, value) => {
              void handleUpdateRow(rowId, property, value)
            }}
            onUpdateView={handleUpdateView}
            onAddColumn={handleAddColumn}
            onUpdateColumn={handleUpdateColumn}
            onDeleteColumn={handleDeleteColumn}
            onAddRow={() => {
              void handleAddRow()
            }}
            onDeleteRow={(rowId) => {
              void handleDeleteRow(rowId)
            }}
            cellPresences={cellPresences}
            onCellFocus={handleCellFocus}
            onCellBlur={handleCellBlur}
          />
        )}

        {viewMode === 'board' && boardViewConfig && (
          <BoardView
            schema={schema}
            view={boardViewConfig}
            data={flatRows}
            onUpdateRow={(rowId, property, value) => {
              void handleUpdateRow(rowId, property, value)
            }}
            onUpdateView={handleUpdateView}
            onAddCard={() => {
              void handleAddRow()
            }}
            onCardClick={handleCardClick}
          />
        )}
      </div>

      <CardDetailModal
        isOpen={selectedCardId !== null}
        onClose={handleCloseModal}
        row={selectedRow}
        schema={schema}
        onUpdateRow={(rowId, property, value) => {
          void handleUpdateRow(rowId, property, value)
        }}
        onDeleteRow={(rowId) => {
          void handleDeleteRow(rowId)
        }}
      />
    </div>
  )
}
