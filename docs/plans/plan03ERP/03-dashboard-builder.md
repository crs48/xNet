# 03: Dashboard Builder

> Widget-based dashboard system with drag-drop layout and live data binding

**Package:** `@xnetjs/dashboard`
**Dependencies:** `@xnetjs/modules`, `@xnetjs/views`, `@xnetjs/data`
**Estimated Time:** 3 weeks

> **Architecture Update (Jan 2026):**
>
> - `@xnetjs/database` → `@xnetjs/data`
> - Widgets query Nodes via `useNodes()` hook
> - Dashboard configs stored as Nodes

## Goals

- Drag-and-drop dashboard composition
- Library of configurable widgets
- Live data binding with auto-refresh
- Cross-filtering between widgets
- Export and sharing capabilities

## Core Types

```typescript
// packages/dashboard/src/types.ts

export type DashboardId = `dash:${string}`
export type WidgetId = `widget:${string}`

// Layout

export interface DashboardDefinition {
  id: DashboardId
  name: string
  description?: string
  moduleId?: ModuleId

  // Layout configuration
  layout: DashboardLayout

  // Widgets
  widgets: WidgetInstance[]

  // Global filters
  filters: GlobalFilter[]

  // Settings
  settings: DashboardSettings

  // Access control
  visibility: 'private' | 'workspace' | 'public'

  // Metadata
  createdAt: number
  updatedAt: number
  createdBy: string
}

export interface DashboardLayout {
  type: 'grid' | 'freeform'
  columns: number // Grid columns (default 12)
  rowHeight: number // Row height in pixels
  gap: number // Gap between widgets
  breakpoints?: Breakpoint[]
}

export interface Breakpoint {
  name: string
  minWidth: number
  columns: number
}

// Widgets

export interface WidgetInstance {
  id: WidgetId
  type: WidgetType

  // Position (grid units)
  position: WidgetPosition

  // Configuration
  config: WidgetConfig

  // Data source
  dataSource: DataSource

  // Interactivity
  interactions: WidgetInteraction[]
}

export interface WidgetPosition {
  x: number
  y: number
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

export type WidgetType =
  | 'metric'
  | 'chart'
  | 'table'
  | 'list'
  | 'text'
  | 'image'
  | 'calendar'
  | 'map'
  | 'progress'
  | 'custom'

export interface WidgetConfig {
  title?: string
  showTitle: boolean
  refreshInterval?: number // Seconds, 0 = manual only

  // Type-specific config
  [key: string]: unknown
}

// Data Sources

export interface DataSource {
  type: 'database' | 'view' | 'formula' | 'api' | 'static'

  // Database source
  databaseId?: DatabaseId
  viewId?: ViewId

  // Query configuration
  query?: DataQuery

  // Transformations
  transforms?: DataTransform[]

  // Caching
  cache?: CacheConfig
}

export interface DataQuery {
  // Filter
  filter?: FilterGroup

  // Sort
  sorts?: SortConfig[]

  // Pagination
  limit?: number
  offset?: number

  // Aggregation
  groupBy?: string[]
  aggregations?: Aggregation[]
}

export interface Aggregation {
  field: string
  function: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'distinct'
  alias: string
}

export interface DataTransform {
  type: 'map' | 'filter' | 'sort' | 'group' | 'pivot' | 'formula'
  config: Record<string, unknown>
}

// Interactions

export interface WidgetInteraction {
  trigger: 'click' | 'hover' | 'select'
  action: InteractionAction
}

export type InteractionAction =
  | { type: 'filter'; targetWidgets: WidgetId[]; field: string }
  | { type: 'navigate'; url: string }
  | { type: 'open_record'; databaseId: DatabaseId }
  | { type: 'run_workflow'; workflowId: WorkflowId }
  | { type: 'custom'; handler: string }

// Filters

export interface GlobalFilter {
  id: string
  label: string
  type: 'select' | 'multiselect' | 'date_range' | 'search'
  field: string
  targetWidgets: WidgetId[] | 'all'
  defaultValue?: unknown
}

// Settings

export interface DashboardSettings {
  autoRefresh: boolean
  refreshInterval: number // Seconds
  allowExport: boolean
  allowFullscreen: boolean
  theme?: 'light' | 'dark' | 'system'
}
```

## Widget Definitions

```typescript
// packages/dashboard/src/widgets/types.ts

export interface WidgetDefinition<TConfig = unknown> {
  type: WidgetType
  name: string
  description: string
  icon: string

  // Default configuration
  defaultConfig: TConfig

  // Default size
  defaultSize: { width: number; height: number }
  minSize: { width: number; height: number }

  // Supported data types
  supportedDataTypes: PropertyType[]

  // Configuration schema (for property panel)
  configSchema: ConfigSchema

  // Render component
  component: React.ComponentType<WidgetProps<TConfig>>
}

export interface WidgetProps<TConfig> {
  id: WidgetId
  config: TConfig
  data: WidgetData
  isEditing: boolean
  isLoading: boolean
  error?: Error

  // Callbacks
  onConfigChange: (config: Partial<TConfig>) => void
  onInteraction: (event: InteractionEvent) => void
}

export interface WidgetData {
  records: Record<string, unknown>[]
  aggregations?: Record<string, number>
  metadata: {
    totalCount: number
    lastUpdated: number
  }
}

// Metric Widget

export interface MetricWidgetConfig {
  valueField: string
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max'
  format?: 'number' | 'currency' | 'percent'
  precision?: number
  prefix?: string
  suffix?: string

  // Comparison
  comparisonField?: string
  comparisonLabel?: string

  // Styling
  fontSize?: 'small' | 'medium' | 'large'
  color?: string

  // Conditional formatting
  thresholds?: Threshold[]
}

export interface Threshold {
  value: number
  color: string
  label?: string
}

// Chart Widget

export interface ChartWidgetConfig {
  chartType: 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter'

  // Axes
  xAxis: AxisConfig
  yAxis: AxisConfig

  // Series
  series: SeriesConfig[]

  // Legend
  showLegend: boolean
  legendPosition: 'top' | 'bottom' | 'left' | 'right'

  // Styling
  colors?: string[]
  stacked?: boolean
  smooth?: boolean

  // Interactions
  enableZoom: boolean
  enableTooltip: boolean
}

export interface AxisConfig {
  field: string
  label?: string
  type?: 'category' | 'value' | 'time'
  format?: string
}

export interface SeriesConfig {
  field: string
  label: string
  type?: 'bar' | 'line' | 'area'
  color?: string
}

// Table Widget

export interface TableWidgetConfig {
  columns: TableColumn[]

  // Features
  showRowNumbers: boolean
  enableSorting: boolean
  enableFiltering: boolean
  enablePagination: boolean
  pageSize: number

  // Selection
  selectionMode: 'none' | 'single' | 'multiple'

  // Row actions
  rowActions?: RowAction[]

  // Styling
  density: 'compact' | 'normal' | 'comfortable'
  striped: boolean
}

export interface TableColumn {
  field: string
  label: string
  width?: number
  align?: 'left' | 'center' | 'right'
  format?: string
  sortable?: boolean
  filterable?: boolean
}

export interface RowAction {
  id: string
  label: string
  icon?: string
  action: InteractionAction
}
```

## Dashboard Builder Component

```typescript
// packages/dashboard/src/builder/DashboardBuilder.tsx

import React, { useCallback, useState } from 'react'
import { DndContext, DragEndEvent, DragOverlay } from '@dnd-kit/core'
import { GridLayout } from './GridLayout'
import { WidgetPalette } from './WidgetPalette'
import { PropertyPanel } from './PropertyPanel'
import { DashboardToolbar } from './DashboardToolbar'

interface DashboardBuilderProps {
  dashboard: DashboardDefinition
  onChange: (dashboard: DashboardDefinition) => void
  onSave: () => Promise<void>
  isReadOnly?: boolean
}

export function DashboardBuilder({
  dashboard,
  onChange,
  onSave,
  isReadOnly = false
}: DashboardBuilderProps) {
  const [selectedWidget, setSelectedWidget] = useState<WidgetId | null>(null)
  const [isEditing, setIsEditing] = useState(!isReadOnly)
  const [draggedWidget, setDraggedWidget] = useState<WidgetType | null>(null)

  // Add widget from palette
  const handleAddWidget = useCallback((type: WidgetType, position: WidgetPosition) => {
    const definition = getWidgetDefinition(type)
    const newWidget: WidgetInstance = {
      id: `widget:${generateId()}`,
      type,
      position: {
        ...position,
        width: definition.defaultSize.width,
        height: definition.defaultSize.height
      },
      config: { ...definition.defaultConfig, showTitle: true },
      dataSource: { type: 'static' },
      interactions: []
    }

    onChange({
      ...dashboard,
      widgets: [...dashboard.widgets, newWidget]
    })

    setSelectedWidget(newWidget.id)
  }, [dashboard, onChange])

  // Update widget
  const handleWidgetUpdate = useCallback((widgetId: WidgetId, updates: Partial<WidgetInstance>) => {
    onChange({
      ...dashboard,
      widgets: dashboard.widgets.map(w =>
        w.id === widgetId ? { ...w, ...updates } : w
      )
    })
  }, [dashboard, onChange])

  // Delete widget
  const handleWidgetDelete = useCallback((widgetId: WidgetId) => {
    onChange({
      ...dashboard,
      widgets: dashboard.widgets.filter(w => w.id !== widgetId)
    })
    if (selectedWidget === widgetId) {
      setSelectedWidget(null)
    }
  }, [dashboard, onChange, selectedWidget])

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      setDraggedWidget(null)
      return
    }

    // New widget from palette
    if (active.data.current?.fromPalette) {
      const type = active.data.current.widgetType as WidgetType
      const position = over.data.current?.position as WidgetPosition
      handleAddWidget(type, position)
    }
    // Move existing widget
    else if (active.data.current?.widgetId) {
      const widgetId = active.data.current.widgetId as WidgetId
      const newPosition = over.data.current?.position as WidgetPosition
      handleWidgetUpdate(widgetId, { position: newPosition })
    }

    setDraggedWidget(null)
  }, [handleAddWidget, handleWidgetUpdate])

  const selectedWidgetData = selectedWidget
    ? dashboard.widgets.find(w => w.id === selectedWidget)
    : null

  return (
    <div className="dashboard-builder">
      <DashboardToolbar
        dashboard={dashboard}
        isEditing={isEditing}
        onEditToggle={() => setIsEditing(!isEditing)}
        onSave={onSave}
        onChange={onChange}
      />

      <div className="dashboard-builder-content">
        {isEditing && (
          <WidgetPalette
            onDragStart={(type) => setDraggedWidget(type)}
          />
        )}

        <DndContext onDragEnd={handleDragEnd}>
          <GridLayout
            layout={dashboard.layout}
            widgets={dashboard.widgets}
            selectedWidget={selectedWidget}
            isEditing={isEditing}
            onWidgetSelect={setSelectedWidget}
            onWidgetResize={(id, size) => handleWidgetUpdate(id, {
              position: { ...dashboard.widgets.find(w => w.id === id)!.position, ...size }
            })}
          />

          <DragOverlay>
            {draggedWidget && (
              <WidgetPreview type={draggedWidget} />
            )}
          </DragOverlay>
        </DndContext>

        {isEditing && selectedWidgetData && (
          <PropertyPanel
            widget={selectedWidgetData}
            onChange={(updates) => handleWidgetUpdate(selectedWidget!, updates)}
            onDelete={() => handleWidgetDelete(selectedWidget!)}
          />
        )}
      </div>
    </div>
  )
}
```

## Grid Layout System

```typescript
// packages/dashboard/src/builder/GridLayout.tsx

import React, { useCallback, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { WidgetRenderer } from './WidgetRenderer'

interface GridLayoutProps {
  layout: DashboardLayout
  widgets: WidgetInstance[]
  selectedWidget: WidgetId | null
  isEditing: boolean
  onWidgetSelect: (id: WidgetId | null) => void
  onWidgetResize: (id: WidgetId, size: { width: number; height: number }) => void
}

export function GridLayout({
  layout,
  widgets,
  selectedWidget,
  isEditing,
  onWidgetSelect,
  onWidgetResize
}: GridLayoutProps) {
  const { columns, rowHeight, gap } = layout

  // Calculate grid dimensions
  const gridStyle = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gridAutoRows: `${rowHeight}px`,
    gap: `${gap}px`,
    padding: gap
  }), [columns, rowHeight, gap])

  // Calculate occupied cells
  const occupiedCells = useMemo(() => {
    const cells = new Set<string>()
    for (const widget of widgets) {
      for (let x = widget.position.x; x < widget.position.x + widget.position.width; x++) {
        for (let y = widget.position.y; y < widget.position.y + widget.position.height; y++) {
          cells.add(`${x},${y}`)
        }
      }
    }
    return cells
  }, [widgets])

  // Find next available position
  const findAvailablePosition = useCallback((width: number, height: number): WidgetPosition => {
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x <= columns - width; x++) {
        let fits = true
        for (let dx = 0; dx < width && fits; dx++) {
          for (let dy = 0; dy < height && fits; dy++) {
            if (occupiedCells.has(`${x + dx},${y + dy}`)) {
              fits = false
            }
          }
        }
        if (fits) {
          return { x, y, width, height }
        }
      }
    }
    return { x: 0, y: 0, width, height }
  }, [columns, occupiedCells])

  // Drop zone for new widgets
  const { setNodeRef, isOver } = useDroppable({
    id: 'grid-drop-zone',
    data: {
      position: findAvailablePosition(4, 3)
    }
  })

  return (
    <div
      ref={setNodeRef}
      className={`grid-layout ${isOver ? 'grid-layout--dropping' : ''}`}
      style={gridStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onWidgetSelect(null)
        }
      }}
    >
      {widgets.map((widget) => (
        <WidgetRenderer
          key={widget.id}
          widget={widget}
          isSelected={selectedWidget === widget.id}
          isEditing={isEditing}
          onSelect={() => onWidgetSelect(widget.id)}
          onResize={(size) => onWidgetResize(widget.id, size)}
          style={{
            gridColumn: `${widget.position.x + 1} / span ${widget.position.width}`,
            gridRow: `${widget.position.y + 1} / span ${widget.position.height}`
          }}
        />
      ))}

      {isEditing && (
        <GridOverlay
          columns={columns}
          rows={20}
          occupiedCells={occupiedCells}
        />
      )}
    </div>
  )
}

function GridOverlay({
  columns,
  rows,
  occupiedCells
}: {
  columns: number
  rows: number
  occupiedCells: Set<string>
}) {
  const cells = []

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const isOccupied = occupiedCells.has(`${x},${y}`)
      cells.push(
        <div
          key={`${x},${y}`}
          className={`grid-cell ${isOccupied ? 'grid-cell--occupied' : ''}`}
          style={{
            gridColumn: x + 1,
            gridRow: y + 1
          }}
        />
      )
    }
  }

  return <div className="grid-overlay">{cells}</div>
}
```

## Data Binding System

```typescript
// packages/dashboard/src/data/DataProvider.ts

import { DatabaseManager } from '@xnetjs/database'
import { ViewEngine } from '@xnetjs/views'

export class DataProvider {
  private cache = new Map<string, CachedData>()
  private subscriptions = new Map<string, Set<(data: WidgetData) => void>>()

  constructor(
    private databaseManager: DatabaseManager,
    private viewEngine: ViewEngine
  ) {}

  // Fetch data for a widget
  async fetchData(
    dataSource: DataSource,
    globalFilters?: Record<string, unknown>
  ): Promise<WidgetData> {
    const cacheKey = this.getCacheKey(dataSource, globalFilters)

    // Check cache
    const cached = this.cache.get(cacheKey)
    if (cached && !this.isCacheExpired(cached, dataSource.cache)) {
      return cached.data
    }

    // Fetch based on source type
    let data: WidgetData

    switch (dataSource.type) {
      case 'database':
        data = await this.fetchFromDatabase(dataSource, globalFilters)
        break
      case 'view':
        data = await this.fetchFromView(dataSource, globalFilters)
        break
      case 'formula':
        data = await this.evaluateFormula(dataSource)
        break
      case 'api':
        data = await this.fetchFromApi(dataSource)
        break
      case 'static':
        data = this.getStaticData(dataSource)
        break
      default:
        throw new Error(`Unknown data source type: ${dataSource.type}`)
    }

    // Apply transforms
    if (dataSource.transforms?.length) {
      data = this.applyTransforms(data, dataSource.transforms)
    }

    // Cache result
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    })

    return data
  }

  // Subscribe to data changes
  subscribe(dataSource: DataSource, callback: (data: WidgetData) => void): () => void {
    const key = this.getSubscriptionKey(dataSource)

    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set())
      this.setupRealtimeListener(dataSource)
    }

    this.subscriptions.get(key)!.add(callback)

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(key)
      if (subs) {
        subs.delete(callback)
        if (subs.size === 0) {
          this.subscriptions.delete(key)
          this.teardownRealtimeListener(dataSource)
        }
      }
    }
  }

  private async fetchFromDatabase(
    source: DataSource,
    globalFilters?: Record<string, unknown>
  ): Promise<WidgetData> {
    const database = await this.databaseManager.getDatabase(source.databaseId!)

    // Build query
    let query = database.query()

    // Apply data source filter
    if (source.query?.filter) {
      query = query.filter(source.query.filter)
    }

    // Apply global filters
    if (globalFilters) {
      for (const [field, value] of Object.entries(globalFilters)) {
        if (value !== undefined && value !== null) {
          query = query.filter({ field, operator: 'equals', value })
        }
      }
    }

    // Apply sorting
    if (source.query?.sorts) {
      for (const sort of source.query.sorts) {
        query = query.sort(sort.field, sort.direction)
      }
    }

    // Apply pagination
    if (source.query?.limit) {
      query = query.limit(source.query.limit)
    }
    if (source.query?.offset) {
      query = query.offset(source.query.offset)
    }

    // Execute query
    const results = await query.execute()

    // Apply aggregations if needed
    let aggregations: Record<string, number> | undefined
    if (source.query?.aggregations?.length) {
      aggregations = await this.computeAggregations(results.records, source.query.aggregations)
    }

    return {
      records: results.records,
      aggregations,
      metadata: {
        totalCount: results.totalCount,
        lastUpdated: Date.now()
      }
    }
  }

  private async computeAggregations(
    records: Record<string, unknown>[],
    aggregations: Aggregation[]
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {}

    for (const agg of aggregations) {
      const values = records
        .map((r) => r[agg.field])
        .filter((v): v is number => typeof v === 'number')

      switch (agg.function) {
        case 'count':
          result[agg.alias] = records.length
          break
        case 'sum':
          result[agg.alias] = values.reduce((a, b) => a + b, 0)
          break
        case 'avg':
          result[agg.alias] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
          break
        case 'min':
          result[agg.alias] = Math.min(...values)
          break
        case 'max':
          result[agg.alias] = Math.max(...values)
          break
        case 'distinct':
          result[agg.alias] = new Set(records.map((r) => r[agg.field])).size
          break
      }
    }

    return result
  }

  private applyTransforms(data: WidgetData, transforms: DataTransform[]): WidgetData {
    let records = [...data.records]

    for (const transform of transforms) {
      switch (transform.type) {
        case 'map':
          records = records.map((r) => this.mapRecord(r, transform.config))
          break
        case 'filter':
          records = records.filter((r) => this.filterRecord(r, transform.config))
          break
        case 'sort':
          records = this.sortRecords(records, transform.config)
          break
        case 'group':
          records = this.groupRecords(records, transform.config)
          break
        case 'pivot':
          records = this.pivotRecords(records, transform.config)
          break
      }
    }

    return { ...data, records }
  }

  private setupRealtimeListener(source: DataSource): void {
    if (source.type === 'database' && source.databaseId) {
      this.databaseManager.subscribe(source.databaseId, () => {
        this.invalidateCache(source)
        this.notifySubscribers(source)
      })
    }
  }

  private async notifySubscribers(source: DataSource): Promise<void> {
    const key = this.getSubscriptionKey(source)
    const subs = this.subscriptions.get(key)

    if (subs?.size) {
      const data = await this.fetchData(source)
      for (const callback of subs) {
        callback(data)
      }
    }
  }

  private getCacheKey(source: DataSource, filters?: Record<string, unknown>): string {
    return JSON.stringify({ source, filters })
  }

  private getSubscriptionKey(source: DataSource): string {
    return `${source.type}:${source.databaseId || source.viewId || 'static'}`
  }

  private isCacheExpired(cached: CachedData, config?: CacheConfig): boolean {
    if (!config) return true
    return Date.now() - cached.timestamp > (config.ttl || 60000)
  }

  private invalidateCache(source: DataSource): void {
    for (const key of this.cache.keys()) {
      if (key.includes(source.databaseId || '')) {
        this.cache.delete(key)
      }
    }
  }
}

interface CachedData {
  data: WidgetData
  timestamp: number
}

interface CacheConfig {
  ttl: number
  strategy: 'memory' | 'indexeddb'
}
```

## Widget Hook

```typescript
// packages/dashboard/src/hooks/useWidgetData.ts

import { useEffect, useState, useCallback } from 'react'
import { useDataProvider } from './useDataProvider'
import { useGlobalFilters } from './useGlobalFilters'

export function useWidgetData(
  dataSource: DataSource,
  refreshInterval?: number
): {
  data: WidgetData | null
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<void>
} {
  const dataProvider = useDataProvider()
  const globalFilters = useGlobalFilters()

  const [data, setData] = useState<WidgetData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await dataProvider.fetchData(dataSource, globalFilters)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [dataProvider, dataSource, globalFilters])

  // Initial fetch and subscription
  useEffect(() => {
    fetchData()

    const unsubscribe = dataProvider.subscribe(dataSource, (newData) => {
      setData(newData)
    })

    return unsubscribe
  }, [dataProvider, dataSource, fetchData])

  // Auto-refresh
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return

    const interval = setInterval(fetchData, refreshInterval * 1000)
    return () => clearInterval(interval)
  }, [refreshInterval, fetchData])

  return { data, isLoading, error, refresh: fetchData }
}
```

## Cross-Filtering

```typescript
// packages/dashboard/src/filters/FilterContext.tsx

import React, { createContext, useContext, useReducer, useCallback } from 'react'

interface FilterState {
  globalFilters: Record<string, unknown>
  widgetFilters: Record<WidgetId, Record<string, unknown>>
}

type FilterAction =
  | { type: 'SET_GLOBAL'; field: string; value: unknown }
  | { type: 'SET_WIDGET'; widgetId: WidgetId; field: string; value: unknown }
  | { type: 'CLEAR_GLOBAL'; field: string }
  | { type: 'CLEAR_WIDGET'; widgetId: WidgetId }
  | { type: 'RESET' }

const FilterContext = createContext<{
  state: FilterState
  dispatch: React.Dispatch<FilterAction>
} | null>(null)

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_GLOBAL':
      return {
        ...state,
        globalFilters: { ...state.globalFilters, [action.field]: action.value }
      }
    case 'SET_WIDGET':
      return {
        ...state,
        widgetFilters: {
          ...state.widgetFilters,
          [action.widgetId]: {
            ...state.widgetFilters[action.widgetId],
            [action.field]: action.value
          }
        }
      }
    case 'CLEAR_GLOBAL':
      const { [action.field]: _, ...rest } = state.globalFilters
      return { ...state, globalFilters: rest }
    case 'CLEAR_WIDGET':
      const { [action.widgetId]: __, ...restWidgets } = state.widgetFilters
      return { ...state, widgetFilters: restWidgets }
    case 'RESET':
      return { globalFilters: {}, widgetFilters: {} }
    default:
      return state
  }
}

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(filterReducer, {
    globalFilters: {},
    widgetFilters: {}
  })

  return (
    <FilterContext.Provider value={{ state, dispatch }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters() {
  const context = useContext(FilterContext)
  if (!context) {
    throw new Error('useFilters must be used within FilterProvider')
  }

  const { state, dispatch } = context

  const setGlobalFilter = useCallback((field: string, value: unknown) => {
    dispatch({ type: 'SET_GLOBAL', field, value })
  }, [dispatch])

  const setWidgetFilter = useCallback((widgetId: WidgetId, field: string, value: unknown) => {
    dispatch({ type: 'SET_WIDGET', widgetId, field, value })
  }, [dispatch])

  const clearGlobalFilter = useCallback((field: string) => {
    dispatch({ type: 'CLEAR_GLOBAL', field })
  }, [dispatch])

  const clearWidgetFilters = useCallback((widgetId: WidgetId) => {
    dispatch({ type: 'CLEAR_WIDGET', widgetId })
  }, [dispatch])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [dispatch])

  // Get combined filters for a widget
  const getFiltersForWidget = useCallback((widgetId: WidgetId, targetedBy: WidgetId[]) => {
    const combined = { ...state.globalFilters }

    for (const sourceId of targetedBy) {
      const widgetFilters = state.widgetFilters[sourceId]
      if (widgetFilters) {
        Object.assign(combined, widgetFilters)
      }
    }

    return combined
  }, [state])

  return {
    globalFilters: state.globalFilters,
    widgetFilters: state.widgetFilters,
    setGlobalFilter,
    setWidgetFilter,
    clearGlobalFilter,
    clearWidgetFilters,
    reset,
    getFiltersForWidget
  }
}
```

## Dashboard Persistence

```typescript
// packages/dashboard/src/store/DashboardStore.ts

import { DatabaseManager, Database } from '@xnetjs/database'

export class DashboardStore {
  private database: Database | null = null

  constructor(private databaseManager: DatabaseManager) {}

  async initialize(): Promise<void> {
    this.database = await this.databaseManager.createSystemDatabase('dashboards', {
      properties: [
        { id: 'name', type: 'title' },
        { id: 'description', type: 'text' },
        { id: 'moduleId', type: 'text' },
        { id: 'layout', type: 'json' },
        { id: 'widgets', type: 'json' },
        { id: 'filters', type: 'json' },
        { id: 'settings', type: 'json' },
        { id: 'visibility', type: 'select', options: ['private', 'workspace', 'public'] },
        { id: 'createdBy', type: 'text' },
        { id: 'createdAt', type: 'date' },
        { id: 'updatedAt', type: 'date' }
      ]
    })
  }

  // Create dashboard
  async create(
    definition: Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<DashboardDefinition> {
    const id = `dash:${generateId()}` as DashboardId
    const now = Date.now()

    const dashboard: DashboardDefinition = {
      ...definition,
      id,
      createdAt: now,
      updatedAt: now
    }

    await this.database!.createRecord({
      id,
      ...this.serializeDashboard(dashboard)
    })

    return dashboard
  }

  // Get dashboard by ID
  async get(id: DashboardId): Promise<DashboardDefinition | null> {
    const record = await this.database!.getRecord(id)
    if (!record) return null
    return this.deserializeDashboard(record)
  }

  // Update dashboard
  async update(
    id: DashboardId,
    updates: Partial<DashboardDefinition>
  ): Promise<DashboardDefinition> {
    const existing = await this.get(id)
    if (!existing) {
      throw new Error(`Dashboard not found: ${id}`)
    }

    const updated: DashboardDefinition = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    }

    await this.database!.updateRecord(id, this.serializeDashboard(updated))

    return updated
  }

  // Delete dashboard
  async delete(id: DashboardId): Promise<void> {
    await this.database!.deleteRecord(id)
  }

  // List dashboards
  async list(options?: {
    moduleId?: ModuleId
    visibility?: 'private' | 'workspace' | 'public'
    createdBy?: string
  }): Promise<DashboardDefinition[]> {
    let query = this.database!.query()

    if (options?.moduleId) {
      query = query.filter({ field: 'moduleId', operator: 'equals', value: options.moduleId })
    }
    if (options?.visibility) {
      query = query.filter({ field: 'visibility', operator: 'equals', value: options.visibility })
    }
    if (options?.createdBy) {
      query = query.filter({ field: 'createdBy', operator: 'equals', value: options.createdBy })
    }

    const results = await query.execute()
    return results.records.map((r) => this.deserializeDashboard(r))
  }

  // Duplicate dashboard
  async duplicate(id: DashboardId, newName?: string): Promise<DashboardDefinition> {
    const original = await this.get(id)
    if (!original) {
      throw new Error(`Dashboard not found: ${id}`)
    }

    return this.create({
      ...original,
      name: newName || `${original.name} (Copy)`,
      widgets: original.widgets.map((w) => ({
        ...w,
        id: `widget:${generateId()}` as WidgetId
      }))
    })
  }

  private serializeDashboard(dashboard: DashboardDefinition): Record<string, unknown> {
    return {
      name: dashboard.name,
      description: dashboard.description,
      moduleId: dashboard.moduleId,
      layout: JSON.stringify(dashboard.layout),
      widgets: JSON.stringify(dashboard.widgets),
      filters: JSON.stringify(dashboard.filters),
      settings: JSON.stringify(dashboard.settings),
      visibility: dashboard.visibility,
      createdBy: dashboard.createdBy,
      createdAt: dashboard.createdAt,
      updatedAt: dashboard.updatedAt
    }
  }

  private deserializeDashboard(record: Record<string, unknown>): DashboardDefinition {
    return {
      id: record.id as DashboardId,
      name: record.name as string,
      description: record.description as string | undefined,
      moduleId: record.moduleId as ModuleId | undefined,
      layout: JSON.parse(record.layout as string),
      widgets: JSON.parse(record.widgets as string),
      filters: JSON.parse(record.filters as string),
      settings: JSON.parse(record.settings as string),
      visibility: record.visibility as 'private' | 'workspace' | 'public',
      createdBy: record.createdBy as string,
      createdAt: record.createdAt as number,
      updatedAt: record.updatedAt as number
    }
  }
}
```

## Export System

```typescript
// packages/dashboard/src/export/DashboardExporter.ts

export class DashboardExporter {
  // Export as image
  async exportAsImage(
    dashboardElement: HTMLElement,
    format: 'png' | 'jpeg' = 'png'
  ): Promise<Blob> {
    const html2canvas = await import('html2canvas')
    const canvas = await html2canvas.default(dashboardElement, {
      scale: 2,
      useCORS: true,
      logging: false
    })

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!)
      }, `image/${format}`)
    })
  }

  // Export as PDF
  async exportAsPdf(dashboardElement: HTMLElement, options: PdfOptions = {}): Promise<Blob> {
    const html2canvas = await import('html2canvas')
    const { jsPDF } = await import('jspdf')

    const canvas = await html2canvas.default(dashboardElement, {
      scale: 2,
      useCORS: true
    })

    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const pdf = new jsPDF({
      orientation: options.orientation || 'landscape',
      unit: 'px',
      format: [canvas.width, canvas.height]
    })

    pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height)

    return pdf.output('blob')
  }

  // Export data as CSV
  exportDataAsCsv(data: WidgetData, columns: string[]): string {
    const headers = columns.join(',')
    const rows = data.records.map((record) =>
      columns
        .map((col) => {
          const value = record[col]
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return String(value ?? '')
        })
        .join(',')
    )

    return [headers, ...rows].join('\n')
  }

  // Export data as Excel
  async exportDataAsExcel(
    data: WidgetData,
    columns: string[],
    sheetName: string = 'Data'
  ): Promise<Blob> {
    const XLSX = await import('xlsx')

    const worksheet = XLSX.utils.json_to_sheet(
      data.records.map((r) => {
        const row: Record<string, unknown> = {}
        for (const col of columns) {
          row[col] = r[col]
        }
        return row
      })
    )

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    return new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
  }
}

interface PdfOptions {
  orientation?: 'portrait' | 'landscape'
  title?: string
  includeDate?: boolean
}
```

## File Structure

```
packages/dashboard/
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── builder/
│   │   ├── DashboardBuilder.tsx
│   │   ├── GridLayout.tsx
│   │   ├── FreeformLayout.tsx
│   │   ├── WidgetPalette.tsx
│   │   ├── WidgetRenderer.tsx
│   │   └── PropertyPanel.tsx
│   ├── widgets/
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   ├── MetricWidget.tsx
│   │   ├── ChartWidget.tsx
│   │   ├── TableWidget.tsx
│   │   ├── ListWidget.tsx
│   │   ├── TextWidget.tsx
│   │   ├── CalendarWidget.tsx
│   │   ├── MapWidget.tsx
│   │   └── ProgressWidget.tsx
│   ├── data/
│   │   ├── DataProvider.ts
│   │   ├── DataTransforms.ts
│   │   └── Aggregations.ts
│   ├── filters/
│   │   ├── FilterContext.tsx
│   │   ├── GlobalFilter.tsx
│   │   └── FilterBar.tsx
│   ├── hooks/
│   │   ├── useWidgetData.ts
│   │   ├── useDataProvider.ts
│   │   ├── useGlobalFilters.ts
│   │   └── useDashboard.ts
│   ├── store/
│   │   └── DashboardStore.ts
│   └── export/
│       └── DashboardExporter.ts
├── tests/
│   ├── DashboardBuilder.test.tsx
│   ├── DataProvider.test.ts
│   ├── widgets.test.tsx
│   └── filters.test.ts
└── package.json
```

## Validation Checklist

```markdown
## Dashboard Builder Validation

### Builder UI

- [ ] Widget palette displays all widget types
- [ ] Drag from palette to grid works
- [ ] Widget selection shows property panel
- [ ] Widget resize with handles works
- [ ] Widget delete works
- [ ] Undo/redo works

### Grid Layout

- [ ] Widgets snap to grid
- [ ] Widgets don't overlap
- [ ] Responsive breakpoints work
- [ ] Grid overlay shows in edit mode

### Widgets

- [ ] Metric widget renders values
- [ ] Chart widget renders charts
- [ ] Table widget renders data
- [ ] All widget configs editable
- [ ] Custom widgets can be registered

### Data Binding

- [ ] Database source works
- [ ] View source works
- [ ] Aggregations compute correctly
- [ ] Live updates work
- [ ] Auto-refresh works

### Filtering

- [ ] Global filters apply to widgets
- [ ] Cross-filtering between widgets works
- [ ] Filter reset works
- [ ] Filters persist in URL

### Persistence

- [ ] Dashboard saves correctly
- [ ] Dashboard loads correctly
- [ ] Dashboard duplicate works
- [ ] Dashboard delete works

### Export

- [ ] PNG export works
- [ ] PDF export works
- [ ] CSV export works
- [ ] Excel export works

### Performance

- [ ] Dashboard with 20 widgets loads <1s
- [ ] Data refresh is smooth
- [ ] No memory leaks on navigation
```

---

[← Back to Workflow Engine](./02-workflow-engine.md) | [Next: Plugin System →](./04-plugin-system.md)
