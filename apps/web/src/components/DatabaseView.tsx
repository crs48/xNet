/**
 * Database View — V2 shell over the collaborative grid (exploration 0159).
 *
 * Thin composition: useGridDatabase (nodes via useQuery/SQLite) drives
 * GridToolbar + GridSurface + GridPeek; the database node's Y.Doc is used
 * only as the awareness channel for live cell presence; comments anchor
 * through the universal commenting system.
 */

import { CANVAS_INTERNAL_NODE_MIME, serializeCanvasInternalNodeDragData } from '@xnetjs/canvas'
import {
  type CellValue,
  type ColumnDefinition,
  type FieldType,
  type FileRef,
  cellKey,
  DatabaseRowSchema,
  DatabaseSchema,
  FIELD_TYPES,
  downloadCsv,
  downloadJson,
  exportToCsv,
  exportToJson,
  inferColumnTypes,
  parseCSV,
  parseRow,
  resolveRowHeightPx
} from '@xnetjs/data'
import { useBlobService } from '@xnetjs/editor/react'
import { useGridDatabase, useIdentity, useNode } from '@xnetjs/react'
import {
  CommentPopover,
  MentionTextArea,
  Select,
  setNodeTransfer,
  type CommentThreadData
} from '@xnetjs/ui'
import {
  type CellPresence,
  type DatabaseViewConfig,
  type DatabaseViewRow,
  type GridField,
  EMPTY_VIEW_CONFIG,
  FieldConfigEditor,
  FormView,
  GridPeek,
  GridSkeleton,
  GridSummaryBar,
  GridSurface,
  GridToolbar,
  ViewOptionsBar,
  ViewRenderer,
  registerBuiltinViews,
  resolveGeoFields,
  useDatabaseComments,
  viewRegistry
} from '@xnetjs/views'
import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCommentPeople } from '../hooks/useCommentPeople'
import { useContextPanel, type ContextPanelSection } from '../workbench/context-panel'
import { useWorkbench } from '../workbench/state'
import { useIsCompact } from '../workbench/use-layout-mode'
import { FormShareBar } from './FormShareBar'
import { PresenceAvatars } from './PresenceAvatars'
import { ShareButton } from './ShareButton'

function formatPeekCellValue(value: unknown): string {
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return value.map((entry) => formatPeekCellValue(entry)).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Built-in board/gallery/calendar/timeline/list/map views register once
// through the plugin door (exploration 0339). Guarded for HMR.
if (!viewRegistry.has('board')) registerBuiltinViews()

// Types offered by the add-view picker: table + form are shell-owned,
// everything else comes from the registry.
const ADD_VIEW_TYPES = [
  { type: 'table' as const, label: 'Table' },
  { type: 'board' as const, label: 'Board' },
  { type: 'gallery' as const, label: 'Gallery' },
  { type: 'calendar' as const, label: 'Calendar' },
  { type: 'timeline' as const, label: 'Timeline' },
  { type: 'list' as const, label: 'List' },
  { type: 'map' as const, label: 'Map' },
  { type: 'form' as const, label: 'Form' }
]

interface DatabaseViewProps {
  docId: string
}

// Field types offered in the add/edit field menus (computed/auto types are
// created through dedicated flows later)
const CREATABLE_FIELD_TYPES: FieldType[] = FIELD_TYPES.filter(
  (t) => !['rollup', 'richText', 'updatedBy'].includes(t)
)

// Human-readable labels so the field-type picker reads "Long text", "Multiple
// select" etc. rather than the raw schema ids.
const FIELD_TYPE_LABELS: Partial<Record<FieldType, string>> = {
  text: 'Text',
  number: 'Number',
  checkbox: 'Checkbox',
  date: 'Date',
  dateRange: 'Date range',
  select: 'Single select',
  multiSelect: 'Multiple select',
  person: 'Person',
  url: 'URL',
  email: 'Email',
  phone: 'Phone',
  file: 'File',
  relation: 'Relation',
  tasks: 'Tasks',
  formula: 'Formula',
  created: 'Created time',
  createdBy: 'Created by',
  updated: 'Last edited time'
}

function fieldTypeLabel(type: FieldType): string {
  return FIELD_TYPE_LABELS[type] ?? type
}

const FIELD_TYPE_OPTIONS = CREATABLE_FIELD_TYPES.map((type) => ({
  value: type,
  label: fieldTypeLabel(type)
}))

interface FieldMenuState {
  fieldId: string
  anchor: HTMLElement
}

interface CommentPopoverState {
  rowId: string
  fieldId: string
  anchor: HTMLElement | { x: number; y: number }
}

export function DatabaseView({ docId }: DatabaseViewProps) {
  const { did } = useIdentity()

  // Database node: title + the Y.Doc awareness channel (presence only)
  const {
    data: database,
    loading: nodeLoading,
    update: updateDatabase,
    presence,
    awareness
  } = useNode(DatabaseSchema, docId, {
    createIfMissing: { title: 'Untitled Database' },
    did: did ?? undefined
  })

  const [activeViewId, setActiveViewId] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')

  // Map views feed their visible bounds back as a spatial query window
  // (exploration 0339): only rows inside the viewport are fetched. The
  // window comes from the previous render's active view — one harmless
  // unfiltered fetch on first paint, then viewport-bounded.
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
            // Overscan is in coordinate units: fetch a 25% margin so
            // small pans reuse already-fetched rows
            overscan: Math.max(mapBounds[2] - mapBounds[0], mapBounds[3] - mapBounds[1]) * 0.25
          } as const)
        : undefined,
    [mapBounds, mapGeoProps]
  )

  const grid = useGridDatabase(docId, {
    viewId: activeViewId,
    search: search || undefined,
    spatial
  })

  // ─── File attachments (BlobService: local-first, chunked) ─────────────────
  const blobService = useBlobService()
  const handleUploadFile = useCallback(
    async (file: File): Promise<FileRef | null> => {
      if (!blobService) return null
      try {
        return await blobService.upload(file)
      } catch (err) {
        console.error('[DatabaseView] file upload failed:', err)
        return null
      }
    },
    [blobService]
  )
  const handleResolveFileUrl = useCallback(
    async (ref: FileRef): Promise<string> => {
      if (!blobService) throw new Error('BlobService unavailable')
      return blobService.getUrl(ref)
    },
    [blobService]
  )

  // ─── CSV/JSON import & export (engines in @xnetjs/data) ──────────────────
  const exportColumns = useCallback(
    (): ColumnDefinition[] =>
      grid.fields.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type as ColumnDefinition['type'],
        config: f.config as ColumnDefinition['config']
      })),
    [grid.fields]
  )

  const handleExportCsv = useCallback(() => {
    const csv = exportToCsv(
      grid.rows.map((r) => ({ id: r.id, sortKey: r.sortKey, cells: r.cells })),
      exportColumns()
    )
    downloadCsv(csv, `${database?.title || 'database'}.csv`)
  }, [grid.rows, exportColumns, database?.title])

  const handleExportJson = useCallback(() => {
    const json = exportToJson(
      grid.rows.map((r) => ({ id: r.id, sortKey: r.sortKey, cells: r.cells })),
      exportColumns()
    )
    downloadJson(json, `${database?.title || 'database'}.json`)
  }, [grid.rows, exportColumns, database?.title])

  const handleImportCsv = useCallback(
    async (file: File) => {
      const text = await file.text()
      const parsed = parseCSV(text)
      if (parsed.headers.length === 0) return
      const types = inferColumnTypes(parsed.headers, parsed.rows)

      // Create one field per header (first header becomes the title field
      // when the database doesn't have one yet)
      const hasTitle = grid.fields.some((f) => f.isTitle)
      const headerFieldIds = new Map<string, string>()
      for (let i = 0; i < parsed.headers.length; i++) {
        const header = parsed.headers[i]
        const type = (types.get(header) ?? 'text') as FieldType
        const id = await grid.addField(header, type, undefined, {
          isTitle: !hasTitle && i === 0
        })
        if (id) headerFieldIds.set(header, id)
      }

      // Select-ish headers: persist unique values as option nodes
      const optionMaps = new Map<string, Map<string, string>>()
      for (const header of parsed.headers) {
        const type = types.get(header)
        if (type !== 'select' && type !== 'multiSelect') continue
        const fieldId = headerFieldIds.get(header)
        if (!fieldId) continue
        const idx = parsed.headers.indexOf(header)
        const unique = new Set<string>()
        for (const row of parsed.rows) {
          const raw = row[idx]?.trim()
          if (!raw) continue
          const names =
            type === 'multiSelect'
              ? raw
                  .split(/[,;]/)
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [raw]
          names.forEach((n) => unique.add(n))
        }
        const nameToId = new Map<string, string>()
        for (const name of unique) {
          const optionId = await grid.createOption(fieldId, name)
          if (optionId) nameToId.set(name.toLowerCase(), optionId)
        }
        optionMaps.set(header, nameToId)
      }

      for (const row of parsed.rows) {
        const values = parseRow(row, parsed.headers, types)
        const cells: Record<string, CellValue> = {}
        for (const header of parsed.headers) {
          const fieldId = headerFieldIds.get(header)
          if (!fieldId) continue
          let value = values[header] as CellValue
          const nameToId = optionMaps.get(header)
          if (nameToId) {
            if (Array.isArray(value)) {
              value = value.map((n) => nameToId.get(String(n).toLowerCase()) ?? String(n))
            } else if (typeof value === 'string') {
              value = nameToId.get(value.toLowerCase()) ?? value
            }
          }
          cells[fieldId] = value ?? null
        }
        await grid.addRow(undefined, cells)
      }
    },
    [grid]
  )

  // ─── Bootstrap: fresh databases get a title field + table view ───────────
  const bootstrappedRef = useRef(false)
  useEffect(() => {
    if (grid.loading || bootstrappedRef.current) return
    if (grid.fields.length > 0 || grid.views.length > 0) return
    bootstrappedRef.current = true
    void (async () => {
      await grid.addField('Name', 'text', undefined, { isTitle: true, width: 240 })
      await grid.addView('Table', 'table')
    })()
  }, [grid])

  // ─── Presence (awareness channel) ─────────────────────────────────────────
  const [cellPresences, setCellPresences] = useState<CellPresence[]>([])

  useEffect(() => {
    if (!awareness) return
    const updatePresences = () => {
      const next: CellPresence[] = []
      awareness.getStates().forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId === awareness.clientID) return
        const user = state.user as { did?: string; color?: string; name?: string } | undefined
        const cell = state.cell as { rowId?: string; fieldId?: string } | undefined
        if (!user?.did || !cell?.rowId || !cell?.fieldId) return
        next.push({
          rowId: cell.rowId,
          columnId: cell.fieldId,
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
    (rowId: string, fieldId: string) => {
      awareness?.setLocalStateField('cell', { rowId, fieldId })
    },
    [awareness]
  )

  const handleCellBlur = useCallback(() => {
    awareness?.setLocalStateField('cell', null)
  }, [awareness])

  // ─── Comments ─────────────────────────────────────────────────────────────
  const comments = useDatabaseComments({ databaseNodeId: docId })
  const [commentPopover, setCommentPopover] = useState<CommentPopoverState | null>(null)

  const openCellComments = useCallback(
    (rowId: string, fieldId: string, anchorEl: HTMLElement | null) => {
      setCommentPopover({
        rowId,
        fieldId,
        anchor: anchorEl ?? { x: window.innerWidth / 2, y: 120 }
      })
    },
    []
  )

  const activeThread: CommentThreadData | null = useMemo(() => {
    if (!commentPopover) return null
    const threads = comments.getThreadsForCell(commentPopover.rowId, commentPopover.fieldId)
    const thread = threads[0]
    if (!thread) return null
    return {
      root: {
        id: thread.root.id,
        author: thread.root.properties.createdBy,
        authorDisplayName: undefined,
        content: thread.root.properties.content,
        createdAt: thread.root.createdAt
      },
      replies: thread.replies.map((r) => ({
        id: r.id,
        author: r.properties.createdBy,
        authorDisplayName: undefined,
        content: r.properties.content,
        createdAt: r.createdAt
      })),
      resolved: Boolean(thread.root.properties.resolved)
    }
  }, [commentPopover, comments])

  const [newCommentDraft, setNewCommentDraft] = useState('')
  const commentPeople = useCommentPeople()

  // ─── Peek panel ───────────────────────────────────────────────────────────
  const [peekRowId, setPeekRowId] = useState<string | null>(null)
  const peekRow = useMemo(
    () => grid.rows.find((r) => r.id === peekRowId) ?? null,
    [grid.rows, peekRowId]
  )

  // ─── Workbench integration (0166): tab title + row detail section ─────────
  const databaseTitle = database?.title
  useEffect(() => {
    if (databaseTitle) useWorkbench.getState().setTabTitle(docId, databaseTitle)
  }, [docId, databaseTitle])

  const databaseContextSections = useMemo<ContextPanelSection[]>(
    () => [
      {
        id: 'database-row',
        title: 'Row',
        content: peekRow ? (
          <div className="flex flex-col gap-3 p-3 text-xs text-ink-2">
            <div
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'copyMove'
                const title = formatPeekCellValue(
                  peekRow.cells.title ?? peekRow.cells.name ?? peekRow.id
                )
                setNodeTransfer(event, {
                  nodeId: peekRow.id,
                  nodeType: 'row',
                  title,
                  schemaId: DatabaseRowSchema._schemaId,
                  sourceContext: 'grid-row'
                })
                event.dataTransfer.setData(
                  CANVAS_INTERNAL_NODE_MIME,
                  serializeCanvasInternalNodeDragData({
                    nodeId: peekRow.id,
                    schemaId: DatabaseRowSchema._schemaId,
                    title
                  })
                )
              }}
              className="flex cursor-grab items-center justify-between gap-2 rounded-sm border border-hairline bg-surface-0 px-2 py-1"
              title="Drag this row onto a canvas, relation cell, or the shelf"
            >
              <span className="text-ink-3">Row</span>
              <span className="truncate font-mono text-[11px]">{peekRow.id}</span>
            </div>
            {grid.fields.map((field) => (
              <div key={field.id} className="flex items-start justify-between gap-2">
                <span className="shrink-0 text-ink-3">{field.name}</span>
                <span className="min-w-0 break-words text-right text-ink-1">
                  {formatPeekCellValue(peekRow.cells[field.id])}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-ink-3">
            Open a row to see its detail here. {grid.rows.length} rows in view.
          </div>
        )
      }
    ],
    [peekRow, grid.fields, grid.rows.length]
  )
  useContextPanel(`database:${docId}`, databaseContextSections)

  // ─── Field menus ──────────────────────────────────────────────────────────
  const [fieldMenu, setFieldMenu] = useState<FieldMenuState | null>(null)
  const [addingField, setAddingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<FieldType>('text')
  const menuField = fieldMenu ? grid.fields.find((f) => f.id === fieldMenu.fieldId) : null

  const submitAddField = useCallback(async () => {
    const name = newFieldName.trim()
    if (!name) return
    await grid.addField(name, newFieldType)
    setAddingField(false)
    setNewFieldName('')
    setNewFieldType('text')
  }, [grid, newFieldName, newFieldType])

  // ─── Grid model ───────────────────────────────────────────────────────────
  const gridFields: GridField[] = useMemo(
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

  const gridRows = useMemo(() => grid.rows.map((r) => ({ id: r.id, cells: r.cells })), [grid.rows])

  const activeView = grid.activeView

  // ─── Registry views (board/gallery/calendar/timeline/list/map — 0339) ────
  const isCompact = useIsCompact()
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
  const viewRows: DatabaseViewRow[] = useMemo(
    () => grid.rows.map((r) => ({ id: r.id, sortKey: r.sortKey, cells: r.cells })),
    [grid.rows]
  )
  const viewConfig: DatabaseViewConfig = useMemo(
    () =>
      activeView
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
        : EMPTY_VIEW_CONFIG,
    [activeView]
  )

  // Compact shells: boards/galleries fall back to the list layout
  const registryViewType =
    activeView && activeView.type !== 'table' && activeView.type !== 'form'
      ? isCompact && (activeView.type === 'board' || activeView.type === 'gallery')
        ? 'list'
        : activeView.type
      : null
  const registration = registryViewType ? viewRegistry.get(registryViewType) : undefined

  // Keep the spatial window in sync with the active view: resolve the
  // lat/lng cell property names on map views, clear everything elsewhere.
  useEffect(() => {
    if (registryViewType !== 'map') {
      setMapBounds(null)
      setMapGeoProps(null)
      return
    }
    const geo = resolveGeoFields(allFields, viewConfig)
    setMapGeoProps(geo.lat && geo.lng ? { x: cellKey(geo.lng.id), y: cellKey(geo.lat.id) } : null)
  }, [registryViewType, allFields, viewConfig])

  // View filters/sorts apply client-side over the loaded window — when more
  // rows exist past it, say so instead of presenting a partial result as the
  // whole table (exploration 0340).
  const windowedFilterNotice =
    grid.hasMoreRows &&
    ((activeView?.filters?.conditions.length ?? 0) > 0 || (activeView?.sorts.length ?? 0) > 0)
      ? 'filtered within loaded rows'
      : undefined

  if (nodeLoading || grid.loading) {
    return <GridSkeleton className="-m-6" />
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full -m-6">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <input
          type="text"
          className="text-lg font-semibold border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          value={database?.title || ''}
          onChange={(event) => updateDatabase({ title: event.target.value })}
          placeholder="Untitled"
        />
        <div className="flex-1" />
        <PresenceAvatars presence={presence} />
        <ShareButton docId={docId} docType="database" />
      </div>

      {/* Toolbar */}
      <GridToolbar
        views={grid.views.map((v) => ({ id: v.id, name: v.name, type: v.type }))}
        activeViewId={activeView?.id}
        onSelectView={setActiveViewId}
        addViewTypes={ADD_VIEW_TYPES}
        onAddViewOfType={(type) => {
          void (async () => {
            const label = ADD_VIEW_TYPES.find((t) => t.type === type)?.label
            const name = label ?? `View ${grid.views.length + 1}`
            const id = await grid.addView(name, type)
            if (id) setActiveViewId(id)
          })()
        }}
        fields={grid.fields.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          config: f.config as Record<string, unknown>,
          width: f.width,
          options: f.options
        }))}
        hiddenFieldIds={activeView?.hiddenFields ?? []}
        onToggleFieldVisible={(fieldId, hidden) => {
          void grid.setFieldHidden(fieldId, hidden)
        }}
        sorts={activeView?.sorts ?? []}
        onToggleSort={(fieldId) => {
          void grid.toggleSort(fieldId)
        }}
        onClearSorts={() => {
          if (activeView?.sorts.length) void grid.toggleSort(activeView.sorts[0].columnId)
        }}
        filters={activeView?.filters ?? null}
        onChangeFilters={(filters) => {
          void grid.setFilters(filters)
        }}
        groupBy={activeView?.groupBy ?? null}
        onChangeGroupBy={(fieldId) => {
          void grid.setGroupBy(fieldId)
        }}
        rowHeight={activeView?.rowHeight}
        onChangeRowHeight={(height) => {
          void grid.setRowHeight(height)
        }}
        search={search}
        onSearchChange={setSearch}
        onExportCsv={handleExportCsv}
        onExportJson={handleExportJson}
        onImportCsv={(file) => {
          void handleImportCsv(file)
        }}
        rowCount={grid.rows.length}
      />

      {/* Body: form view, registry view (board/gallery/…), or grid + peek */}
      {registryViewType && registration ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <ViewOptionsBar
              configFields={registration.configFields ?? []}
              fields={allFields}
              config={viewConfig}
              onPatchConfig={(patch) => {
                void grid.setViewConfig(patch)
              }}
            />
            <div className="flex-1 overflow-hidden">
              <ViewRenderer
                type={registryViewType}
                fields={allFields}
                visibleFields={gridFields}
                rows={viewRows}
                window={grid.rowWindow}
                config={viewConfig}
                sorted={(activeView?.sorts.length ?? 0) > 0}
                compact={isCompact}
                onPatchConfig={(patch) => {
                  void grid.setViewConfig(patch)
                }}
                onUpdateCell={(rowId, fieldId, value) => {
                  void grid.updateCell(rowId, fieldId, value)
                }}
                onMoveCard={(rowId, cells, opts) => {
                  void grid.updateRowCells(rowId, cells, opts)
                }}
                onToggleGroupCollapsed={(groupKey, collapsed) => {
                  void grid.setGroupCollapsed(groupKey, collapsed)
                }}
                onOpenRow={setPeekRowId}
                onCreateRow={(cells) => {
                  void grid.addRow(undefined, cells)
                }}
                onCreateOption={grid.createOption}
                onResolveFileUrl={blobService ? handleResolveFileUrl : undefined}
                onBoundsChange={setMapBounds}
              />
            </div>
          </div>

          {peekRow && (
            <div className="w-[420px] shrink-0">
              <GridPeek
                row={{ id: peekRow.id, cells: peekRow.cells }}
                fields={allFields}
                onClose={() => setPeekRowId(null)}
                onUpdateCell={(rowId, fieldId, value) => {
                  void grid.updateCell(rowId, fieldId, value)
                }}
                onDeleteRow={(rowId) => {
                  void grid.deleteRows([rowId])
                }}
                onCreateOption={grid.createOption}
                onUploadFile={blobService ? handleUploadFile : undefined}
                onResolveFileUrl={blobService ? handleResolveFileUrl : undefined}
              >
                <div className="text-xs text-gray-500">
                  {comments.rowCommentCounts.get(peekRow.id) ?? 0} comments on this row
                </div>
              </GridPeek>
            </div>
          )}
        </div>
      ) : activeView?.type === 'form' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <FormShareBar
            viewId={activeView.id}
            databaseId={docId}
            space={(database as { space?: string } | null)?.space ?? null}
            accepting={activeView.formAccepting}
            config={activeView.formConfig}
            rules={activeView.formRules}
            fields={grid.fields.map((f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              config: f.config as Record<string, unknown>,
              options: f.options
            }))}
          />
          <FormView
            fields={grid.fields.map((f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              config: f.config as Record<string, unknown>,
              width: f.width,
              isTitle: f.isTitle,
              options: f.options
            }))}
            config={activeView.formConfig}
            rules={activeView.formRules}
            accepting={activeView.formAccepting}
            databaseTitle={database?.title}
            editable
            onSubmit={async (cells) =>
              (await grid.addRow(undefined, cells, {
                meta: { via: 'form', viewId: activeView.id, submittedAt: Date.now() }
              })) !== null
            }
            onChangeConfig={(next) => {
              void grid.setFormConfig(next)
            }}
            onChangeRules={(next) => {
              void grid.setFormRules(next)
            }}
            onChangeAccepting={(next) => {
              void grid.setFormAccepting(next)
            }}
            onUploadFile={blobService ? handleUploadFile : undefined}
            onResolveFileUrl={blobService ? handleResolveFileUrl : undefined}
            className="flex-1"
          />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <GridSurface
                fields={gridFields}
                rows={gridRows}
                rowHeight={resolveRowHeightPx(activeView?.rowHeight)}
                sorts={activeView?.sorts}
                presences={cellPresences}
                cellCommentCounts={comments.cellCommentCounts}
                totalRowCount={grid.totalRowCount}
                hasMoreRows={grid.hasMoreRows}
                loadingMoreRows={grid.isFetchingMoreRows}
                onReachEnd={() => {
                  void grid.fetchMoreRows()
                }}
                footerNotice={windowedFilterNotice}
                onUpdateCell={(rowId, fieldId, value) => {
                  void grid.updateCell(rowId, fieldId, value)
                }}
                onClearCells={(cells) => {
                  void grid.clearCells(cells)
                }}
                onAddRow={(afterRowId) => {
                  void grid.addRow(afterRowId)
                }}
                onAddRowWithCells={(cells) => {
                  void grid.addRow(undefined, cells)
                }}
                onAddFieldWithCell={(rowId, value) => {
                  void (async () => {
                    const fieldId = await grid.addField(`Column ${grid.fields.length + 1}`, 'text')
                    if (fieldId) await grid.updateCell(rowId, fieldId, value)
                  })()
                }}
                onDeleteRows={(rowIds) => {
                  void grid.deleteRows(rowIds)
                }}
                onMoveRow={(rowId, targetIndex) => {
                  void grid.moveRowToIndex(rowId, targetIndex)
                }}
                onMoveField={(fieldId, targetIndex) => {
                  void grid.moveFieldToIndex(fieldId, targetIndex)
                }}
                onResizeField={(fieldId, width) => {
                  void grid.resizeField(fieldId, width)
                }}
                onToggleSort={(fieldId) => {
                  void grid.toggleSort(fieldId)
                }}
                onFieldMenu={(fieldId, anchorEl) => setFieldMenu({ fieldId, anchor: anchorEl })}
                onAddField={() => setAddingField(true)}
                onCreateOption={grid.createOption}
                onUploadFile={blobService ? handleUploadFile : undefined}
                onResolveFileUrl={blobService ? handleResolveFileUrl : undefined}
                onOpenRow={setPeekRowId}
                onUndo={() => {
                  void grid.undo()
                }}
                onRedo={() => {
                  void grid.redo()
                }}
                onCommentCell={openCellComments}
                onCellFocus={handleCellFocus}
                onCellBlur={handleCellBlur}
              />
            </div>
            <GridSummaryBar
              fields={gridFields}
              rows={gridRows}
              summaries={activeView?.columnSummaries ?? {}}
              onChangeSummary={(fieldId, fn) => {
                void grid.setColumnSummary(fieldId, fn)
              }}
            />
          </div>

          {peekRow && (
            <div className="w-[420px] shrink-0">
              <GridPeek
                row={{ id: peekRow.id, cells: peekRow.cells }}
                fields={grid.fields.map((f) => ({
                  id: f.id,
                  name: f.name,
                  type: f.type,
                  config: f.config as Record<string, unknown>,
                  width: f.width,
                  isTitle: f.isTitle,
                  options: f.options
                }))}
                onClose={() => setPeekRowId(null)}
                onUpdateCell={(rowId, fieldId, value) => {
                  void grid.updateCell(rowId, fieldId, value)
                }}
                onDeleteRow={(rowId) => {
                  void grid.deleteRows([rowId])
                }}
                onCreateOption={grid.createOption}
                onUploadFile={blobService ? handleUploadFile : undefined}
                onResolveFileUrl={blobService ? handleResolveFileUrl : undefined}
              >
                {/* Row comments summary */}
                <div className="text-xs text-gray-500">
                  {comments.rowCommentCounts.get(peekRow.id) ?? 0} comments on this row
                </div>
              </GridPeek>
            </div>
          )}
        </div>
      )}

      {/* Field menu popover */}
      {fieldMenu && menuField && (
        <div
          className="fixed inset-0 z-40"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFieldMenu(null)
          }}
        >
          <div
            className="absolute z-50 w-64 rounded-lg border border-hairline bg-popover shadow-pop p-2"
            style={{
              top: fieldMenu.anchor.getBoundingClientRect().bottom + 4,
              left: Math.min(fieldMenu.anchor.getBoundingClientRect().left, window.innerWidth - 280)
            }}
          >
            <input
              type="text"
              aria-label="Field name"
              defaultValue={menuField.name}
              autoFocus
              className="w-full mb-2 px-2 py-1 text-sm rounded border border-border bg-transparent outline-none focus:border-border-emphasis"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const name = (e.target as HTMLInputElement).value.trim()
                  if (name && name !== menuField.name) void grid.renameField(menuField.id, name)
                  setFieldMenu(null)
                }
                if (e.key === 'Escape') setFieldMenu(null)
                e.stopPropagation()
              }}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== menuField.name) void grid.renameField(menuField.id, name)
              }}
            />
            <div className="mb-2">
              <Select
                className="w-full"
                placeholder="Field type"
                options={FIELD_TYPE_OPTIONS}
                value={menuField.type}
                onValueChange={(value) => {
                  void grid.changeFieldType(menuField.id, value as FieldType)
                }}
              />
            </div>
            <FieldConfigEditor
              field={menuField}
              fields={grid.fields}
              onSave={(config) => {
                void grid.updateFieldConfig(menuField.id, config)
              }}
            />
            <button
              type="button"
              className="w-full px-2 py-1 text-left text-sm rounded hover:bg-accent"
              onClick={() => {
                void grid.setFieldHidden(menuField.id, true)
                setFieldMenu(null)
              }}
            >
              Hide in view
            </button>
            <button
              type="button"
              className="w-full px-2 py-1 flex items-center gap-1 text-left text-sm rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={() => {
                if (window.confirm(`Delete field "${menuField.name}"?`)) {
                  void grid.removeField(menuField.id)
                }
                setFieldMenu(null)
              }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete field
            </button>
          </div>
        </div>
      )}

      {/* Add field popover */}
      {addingField && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center pt-32"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAddingField(false)
          }}
        >
          <div className="w-72 rounded-lg border border-hairline bg-popover shadow-pop p-3">
            <h3 className="text-sm font-medium mb-2">New field</h3>
            <input
              type="text"
              aria-label="New field name"
              placeholder="Field name"
              value={newFieldName}
              autoFocus
              className="w-full mb-2 px-2 py-1 text-sm rounded border border-border bg-transparent outline-none focus:border-border-emphasis"
              onChange={(e) => setNewFieldName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitAddField()
                if (e.key === 'Escape') setAddingField(false)
                e.stopPropagation()
              }}
            />
            <div className="mb-3">
              <Select
                className="w-full"
                placeholder="Field type"
                options={FIELD_TYPE_OPTIONS}
                value={newFieldType}
                onValueChange={(value) => setNewFieldType(value as FieldType)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 text-sm rounded hover:bg-accent"
                onClick={() => setAddingField(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1 text-sm rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                disabled={!newFieldName.trim()}
                onClick={() => void submitAddField()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cell comments: existing thread popover or new-comment composer */}
      {commentPopover && activeThread && (
        <CommentPopover
          thread={activeThread}
          anchor={commentPopover.anchor}
          mode="full"
          open
          people={commentPeople}
          onReply={(content) => {
            void comments.commentOnCell(commentPopover.rowId, commentPopover.fieldId, content)
          }}
          onDismiss={() => setCommentPopover(null)}
        />
      )}
      {commentPopover && !activeThread && (
        <div
          className="fixed inset-0 z-40"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setCommentPopover(null)
              setNewCommentDraft('')
            }
          }}
        >
          <div
            className="absolute z-50 w-72 rounded-lg border border-hairline bg-popover shadow-pop p-3"
            style={
              commentPopover.anchor instanceof HTMLElement
                ? {
                    top: commentPopover.anchor.getBoundingClientRect().bottom + 4,
                    left: Math.min(
                      commentPopover.anchor.getBoundingClientRect().left,
                      window.innerWidth - 300
                    )
                  }
                : { top: commentPopover.anchor.y, left: commentPopover.anchor.x }
            }
          >
            <MentionTextArea
              data-testid="db-new-comment"
              placeholder="Add a comment… (@ to mention)"
              value={newCommentDraft}
              people={commentPeople}
              autoFocus
              rows={2}
              containerClassName="mb-2"
              className="px-2 py-1 text-sm rounded border border-border bg-transparent outline-none focus:border-border-emphasis resize-none"
              onChange={setNewCommentDraft}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') {
                  setCommentPopover(null)
                  setNewCommentDraft('')
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && newCommentDraft.trim()) {
                  void comments.commentOnCell(
                    commentPopover.rowId,
                    commentPopover.fieldId,
                    newCommentDraft.trim()
                  )
                  setCommentPopover(null)
                  setNewCommentDraft('')
                }
              }}
            />
            <div className="flex justify-end">
              <button
                type="button"
                className="px-3 py-1 text-sm rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                disabled={!newCommentDraft.trim()}
                onClick={() => {
                  void comments.commentOnCell(
                    commentPopover.rowId,
                    commentPopover.fieldId,
                    newCommentDraft.trim()
                  )
                  setCommentPopover(null)
                  setNewCommentDraft('')
                }}
              >
                Comment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
