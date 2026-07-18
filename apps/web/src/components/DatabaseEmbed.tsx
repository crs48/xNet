/**
 * DatabaseEmbed — a live, compact database frame inside a document
 * (exploration 0346, Phase 1).
 *
 * Renders a workspace database through the ViewRegistry (board, list,
 * gallery, calendar, timeline, map, plugin types) or the grid engine
 * (table), inside a bounded card. Fully live: the same useGridDatabase
 * subscription the full surface uses, so edits made anywhere — the grid
 * tab, another embed, a remote peer — update the embed in place.
 */
import { type CellValue, cellKey, DatabaseSchema, resolveRowHeightPx } from '@xnetjs/data'
import { useGridDatabase, useNode, useNodeStore } from '@xnetjs/react'
import { getNodeTransfer, hasNodeTransfer } from '@xnetjs/ui'
import {
  type DatabaseViewConfig,
  type DatabaseViewRow,
  type GridField,
  EMPTY_VIEW_CONFIG,
  GridSurface,
  ViewRenderer,
  registerBuiltinViews,
  resolveGeoFields,
  viewRegistry
} from '@xnetjs/views'
import { Database, ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'

// Built-ins register through the plugin door (0339); guarded for HMR.
if (!viewRegistry.has('board')) registerBuiltinViews()

/** Drop-to-relate (0346): the pending drop awaiting a verb choice. */
interface DropMenuState {
  x: number
  y: number
  nodeId: string
  title: string
  /** Relation fields in THIS database targeting the dragged row's database. */
  relationFields: Array<{ id: string; name: string }>
}

/** Embed heights per view family — bounded so the page stays a page. */
const EMBED_HEIGHT: Record<string, string> = {
  table: 'h-72',
  list: 'h-72',
  board: 'h-80',
  gallery: 'h-80',
  calendar: 'h-96',
  timeline: 'h-80',
  map: 'h-96'
}

export interface DatabaseEmbedProps {
  databaseId: string
  /** Requested view type — registry types plus the shell-owned 'table'. */
  viewType: string
  /** Embed-level presentation overrides (persisted on the block). */
  viewConfig: Record<string, unknown>
  onNavigate?: (href: string) => void
  readOnly?: boolean
  /** "Open with…" (0346): switch this frame's view type in place. */
  onChangeViewType?: (viewType: string) => void
}

/** Keys of DatabaseViewConfig an embed block may override. */
const CONFIG_KEYS: Array<keyof DatabaseViewConfig> = [
  'groupBy',
  'coverField',
  'cardSize',
  'coverFit',
  'colorBy',
  'dateField',
  'endDateField',
  'latField',
  'lngField',
  'mapViewport'
]

export function DatabaseEmbed({
  databaseId,
  viewType: requestedViewType,
  viewConfig: embedConfig,
  onNavigate,
  readOnly,
  onChangeViewType
}: DatabaseEmbedProps): JSX.Element {
  // Form embeds don't fit a compact card; render the grid instead.
  const viewType = requestedViewType === 'form' ? 'table' : requestedViewType

  const { data: database, loading: nodeLoading } = useNode(DatabaseSchema, databaseId)

  // Prefer a persisted view of the requested type (its filters/sorts and
  // presentation config apply); fall back to the default view otherwise.
  const [viewId, setViewId] = useState<string | undefined>(undefined)
  const matchedRef = useRef<string | null>(null)

  // Map embeds feed visible bounds back as a spatial window (0339).
  const [mapBounds, setMapBounds] = useState<[number, number, number, number] | null>(null)
  const [mapGeoProps, setMapGeoProps] = useState<{ x: string; y: string } | null>(null)
  const spatial = useMemo(
    () =>
      mapBounds && mapGeoProps
        ? ({
            kind: 'window' as const,
            rect: {
              x: mapBounds[0],
              y: mapBounds[1],
              width: mapBounds[2] - mapBounds[0],
              height: mapBounds[3] - mapBounds[1]
            },
            fields: mapGeoProps,
            overscan: Math.max(mapBounds[2] - mapBounds[0], mapBounds[3] - mapBounds[1]) * 0.25
          } as const)
        : undefined,
    [mapBounds, mapGeoProps]
  )

  const grid = useGridDatabase(databaseId, {
    viewId,
    pageSize: 100,
    maxLoaded: 500,
    spatial
  })

  useEffect(() => {
    const matchKey = `${databaseId}:${viewType}`
    if (matchedRef.current === matchKey || grid.views.length === 0) return
    matchedRef.current = matchKey
    const match = grid.views.find((v) => v.type === viewType)
    setViewId(match?.id)
  }, [databaseId, viewType, grid.views])

  const activeView = grid.activeView

  const allFields: GridField[] = useMemo(
    () =>
      grid.fields.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        config: f.config as Record<string, unknown>,
        width: f.width,
        isTitle: f.isTitle,
        options: f.options
      })),
    [grid.fields]
  )
  const visibleFields: GridField[] = useMemo(
    () =>
      grid.visibleFields.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        config: f.config as Record<string, unknown>,
        width: f.width,
        isTitle: f.isTitle,
        options: f.options
      })),
    [grid.visibleFields]
  )
  const viewRows: DatabaseViewRow[] = useMemo(
    () => grid.rows.map((r) => ({ id: r.id, sortKey: r.sortKey, cells: r.cells })),
    [grid.rows]
  )

  // View config: persisted view first, embed block overrides on top.
  const config: DatabaseViewConfig = useMemo(() => {
    const base: DatabaseViewConfig = activeView
      ? {
          groupBy: activeView.groupBy,
          collapsedGroups: activeView.collapsedGroups,
          groupMeta: activeView.groupMeta,
          coverField: activeView.coverField,
          cardSize: (activeView.cardSize as DatabaseViewConfig['cardSize']) ?? null,
          coverFit: (activeView.coverFit as DatabaseViewConfig['coverFit']) ?? null,
          colorBy: activeView.colorBy,
          dateField: activeView.dateField,
          endDateField: activeView.endDateField,
          latField: activeView.latField,
          lngField: activeView.lngField,
          mapViewport: activeView.mapViewport
        }
      : EMPTY_VIEW_CONFIG
    const overrides: Partial<DatabaseViewConfig> = {}
    for (const key of CONFIG_KEYS) {
      if (embedConfig[key] !== undefined) {
        ;(overrides as Record<string, unknown>)[key] = embedConfig[key]
      }
    }
    return { ...base, ...overrides }
  }, [activeView, embedConfig])

  // Resolve the map's location binding into spatial cell properties.
  useEffect(() => {
    if (viewType !== 'map') {
      setMapBounds(null)
      setMapGeoProps(null)
      return
    }
    const geo = resolveGeoFields(allFields, config)
    setMapGeoProps(
      geo.geo
        ? { x: `${cellKey(geo.geo.id)}.lng`, y: `${cellKey(geo.geo.id)}.lat` }
        : geo.lat && geo.lng
          ? { x: cellKey(geo.lng.id), y: cellKey(geo.lat.id) }
          : null
    )
  }, [viewType, allFields, config])

  const registration = viewType !== 'table' ? viewRegistry.get(viewType) : undefined
  const height = EMBED_HEIGHT[viewType] ?? 'h-80'
  const title = database?.title || 'Untitled Database'

  // ── Drop-to-relate (0346): dropping a node on the frame offers verbs —
  // add a row, or add a row linked through a matching relation field.
  // Every choice is a normal row write, reversible like any edit.
  const { store } = useNodeStore()
  const [dropMenu, setDropMenu] = useState<DropMenuState | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      if (readOnly || !hasNodeTransfer(event)) return
      event.preventDefault()
      event.stopPropagation()
    },
    [readOnly]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      if (readOnly) return
      const transfer = getNodeTransfer(event)
      if (!transfer || transfer.nodeId === databaseId) return
      event.preventDefault()
      event.stopPropagation()
      const rect = frameRef.current?.getBoundingClientRect()
      const x = rect ? event.clientX - rect.left : 12
      const y = rect ? event.clientY - rect.top : 12
      void (async () => {
        // Relation verbs apply when the dragged node is a row and this
        // database has a relation field targeting the row's database.
        let relationFields: DropMenuState['relationFields'] = []
        if (transfer.nodeType === 'row' && store) {
          const rowState = await store.get(transfer.nodeId)
          const sourceDb = rowState?.properties.database
          if (typeof sourceDb === 'string') {
            relationFields = grid.fields
              .filter(
                (f) =>
                  f.type === 'relation' &&
                  (f.config as { targetDatabase?: string }).targetDatabase === sourceDb
              )
              .map((f) => ({ id: f.id, name: f.name }))
          }
        }
        setDropMenu({
          x,
          y,
          nodeId: transfer.nodeId,
          title: transfer.title || 'Untitled',
          relationFields
        })
      })()
    },
    [readOnly, databaseId, store, grid.fields]
  )

  const titleFieldId = useMemo(
    () => grid.fields.find((f) => f.isTitle)?.id ?? grid.fields[0]?.id,
    [grid.fields]
  )

  const addDroppedRow = useCallback(
    (relationFieldId?: string) => {
      if (!dropMenu) return
      const cells: Record<string, CellValue> = {}
      if (titleFieldId) cells[titleFieldId] = dropMenu.title
      if (relationFieldId) cells[relationFieldId] = [dropMenu.nodeId]
      void grid.addRow(undefined, cells)
      setDropMenu(null)
    },
    [dropMenu, titleFieldId, grid]
  )

  if (!nodeLoading && !grid.loading && !database) {
    // Sealed frame (0346): the source is unreadable here — deleted, not
    // yet synced, or outside this identity's grants. Never an error.
    return (
      <div className="my-1 flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
        <Database size={14} />
        <span>This database isn’t available in this workspace.</span>
      </div>
    )
  }

  return (
    <div
      ref={frameRef}
      data-database-embed-frame={databaseId}
      data-database-embed-view={viewType}
      className="relative my-1 flex w-full flex-col overflow-hidden rounded-lg border border-border/60 bg-background"
      contentEditable={false}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dropMenu && (
        <div
          className="absolute z-40 flex min-w-44 flex-col rounded-md border border-border bg-background py-1 shadow-lg"
          style={{ left: Math.min(dropMenu.x, 320), top: Math.min(dropMenu.y, 200) }}
          data-database-embed-drop-menu="true"
        >
          <button
            type="button"
            className="px-3 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => addDroppedRow()}
          >
            Add row “{dropMenu.title}”
          </button>
          {dropMenu.relationFields.map((field) => (
            <button
              key={field.id}
              type="button"
              className="px-3 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => addDroppedRow(field.id)}
            >
              Add row linked via “{field.name}”
            </button>
          ))}
          <button
            type="button"
            className="px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
            onClick={() => setDropMenu(null)}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <Database size={13} className="shrink-0 text-muted-foreground" />
        <button
          type="button"
          className="min-w-0 truncate border-none bg-transparent p-0 text-left text-sm font-medium text-foreground hover:underline"
          onClick={() => onNavigate?.(`xnet://database/${databaseId}`)}
          title={`Open ${title}`}
        >
          {title}
        </button>
        {onChangeViewType ? (
          // "Open with…" — the frame switches to any registered view in
          // place; plugin views appear the moment they register (0346).
          <select
            aria-label="Open with view"
            value={viewType}
            onChange={(e) => onChangeViewType(e.target.value)}
            className="rounded-full border-none bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground outline-none"
          >
            <option value="table">table</option>
            {viewRegistry.getAll().map((v) => (
              <option key={v.type} value={v.type}>
                {v.type}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {viewType}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {grid.rowWindow.total != null && grid.rowWindow.total > grid.rows.length
            ? `${grid.rows.length} of ${grid.rowWindow.total} rows`
            : `${grid.rows.length} rows`}
        </span>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onNavigate?.(`xnet://database/${databaseId}`)}
          aria-label="Open database"
        >
          <ExternalLink size={13} />
        </button>
      </div>

      <div className={`${height} min-h-0 overflow-hidden`}>
        {grid.loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : registration ? (
          <ViewRenderer
            type={viewType}
            fields={allFields}
            visibleFields={visibleFields}
            rows={viewRows}
            window={grid.rowWindow}
            config={config}
            sorted={(activeView?.sorts.length ?? 0) > 0}
            compact
            onPatchConfig={
              readOnly
                ? undefined
                : (patch) => {
                    void grid.setViewConfig(patch)
                  }
            }
            onUpdateCell={
              readOnly
                ? undefined
                : (rowId: string, fieldId: string, value: CellValue) => {
                    void grid.updateCell(rowId, fieldId, value)
                  }
            }
            onMoveCard={
              readOnly
                ? undefined
                : (rowId, cells, opts) => {
                    void grid.updateRowCells(rowId, cells, opts)
                  }
            }
            onOpenRow={() => onNavigate?.(`xnet://database/${databaseId}`)}
            onCreateRow={
              readOnly
                ? undefined
                : (cells) => {
                    void grid.addRow(undefined, cells)
                  }
            }
            onCreateOption={readOnly ? undefined : grid.createOption}
            onBoundsChange={viewType === 'map' ? setMapBounds : undefined}
          />
        ) : (
          <GridSurface
            fields={visibleFields}
            rows={viewRows}
            sorts={activeView?.sorts}
            rowHeight={resolveRowHeightPx(activeView?.rowHeight)}
            readOnly={readOnly}
            totalRowCount={grid.totalRowCount}
            hasMoreRows={grid.hasMoreRows}
            loadingMoreRows={grid.isFetchingMoreRows}
            onReachEnd={() => {
              void grid.fetchMoreRows()
            }}
            onUpdateCell={
              readOnly
                ? undefined
                : (rowId: string, fieldId: string, value: CellValue) => {
                    void grid.updateCell(rowId, fieldId, value)
                  }
            }
            onAddRow={
              readOnly
                ? undefined
                : () => {
                    void grid.addRow()
                  }
            }
          />
        )}
      </div>
    </div>
  )
}
