/**
 * Data panel — a queryable, schema-aware browser over every node in the store.
 *
 * Renders node data in the real database grid (GridSurface, read-only) with a
 * schema picker, live search, a storage-pushdown query-plan inspector, and a
 * row detail pane. Live-updates via store.subscribe (no polling).
 */

import type { NodeState } from '@xnetjs/data'
import {
  ROW_HEIGHT_PX,
  downloadCsv,
  downloadJson,
  exportToCsv,
  exportToJson,
  filterRows,
  sortRows
} from '@xnetjs/data'
import { GridSurface, GridToolbar, type GridField } from '@xnetjs/views'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary'
import { useDevTools } from '../../provider/useDevTools'
import { truncateDID } from '../../utils/formatters'
import { AuthTraceView, type AuthTrace } from '../AuthZPanel/AuthTraceView'
import {
  buildGridFields,
  formatPlanRows,
  formatSchemaOptionLabel,
  gridFieldsToColumnDefinitions,
  nodeToGridRow,
  observedPropertyKeys,
  type DataGridRow,
  type PlanMeta
} from './grid-adapter'
import { useCellPermissions } from './useCellPermissions'
import { useDataExplorer } from './useDataExplorer'

export function DataExplorer() {
  const {
    schemaOptions,
    schemaCounts,
    allCount,
    selectedSchema,
    setSelectedSchema,
    definedSchema,
    schemaStatus,
    search,
    setSearch,
    includeDeleted,
    setIncludeDeleted,
    nodes,
    totalCount,
    loadedCount,
    truncated,
    plan,
    error,
    loading,
    refresh,
    selectedNode,
    setSelectedNodeId,
    editing,
    setEditing,
    editError,
    updateCell,
    sorts,
    filters,
    rowHeight,
    hiddenFieldIds,
    toggleSort,
    clearSorts,
    setFilters,
    setRowHeight,
    toggleFieldVisible
  } = useDataExplorer()

  const showSchemaColumn = !selectedSchema
  // Editing only makes sense with a known schema (real typed columns) — the
  // "All schemas" view synthesizes columns and stays read-only.
  const editable = editing && Boolean(selectedSchema) && Boolean(definedSchema)
  const fields: GridField[] = useMemo(
    () => buildGridFields(definedSchema, observedPropertyKeys(nodes), showSchemaColumn, editable),
    [definedSchema, nodes, showSchemaColumn, editable]
  )
  const fieldTypeById = useMemo(() => new Map(fields.map((f) => [f.id, f.type])), [fields])
  const columns = useMemo(() => gridFieldsToColumnDefinitions(fields), [fields])

  // Map nodes → rows, then apply the database filter/sort engines client-side
  // over the loaded window (the main database UI slices the same way).
  const displayRows: DataGridRow[] = useMemo(() => {
    const base = nodes.map((n) => nodeToGridRow(n, fieldTypeById))
    return sortRows(filterRows(base, columns, filters), columns, sorts)
  }, [nodes, fieldTypeById, columns, filters, sorts])

  const visibleFields = useMemo(
    () => fields.filter((f) => !hiddenFieldIds.includes(f.id)),
    [fields, hiddenFieldIds]
  )

  // Per-cell authorization: which editable cells the current identity may write.
  const editableFieldIds = useMemo(
    () => fields.filter((f) => !f.readonly && !f.id.startsWith('@@')).map((f) => f.id),
    [fields]
  )
  const { cellLockReasons, authzEnabled } = useCellPermissions({
    nodes,
    schema: definedSchema,
    editing: editable,
    editableFieldIds
  })

  // Copy the raw node window (full fidelity for debugging), not the grid cells.
  const getCopyData = useCallback(() => nodes, [nodes])

  // Tier-2 interchange download of the current view (0344). Deliberately
  // lossy: materialized cell values only — the tooltip says so.
  const handleDownload = useCallback(
    (format: 'csv' | 'json') => {
      const exportRows = displayRows.map((r) => ({ id: r.id, sortKey: r.sortKey, cells: r.cells }))
      const exportColumns = gridFieldsToColumnDefinitions(visibleFields)
      const schemaSlug = selectedSchema?.split('/').pop()?.split('@')[0] ?? 'all-nodes'
      const name = `xnet-${schemaSlug}-${new Date().toISOString().slice(0, 10)}`
      if (format === 'csv') downloadCsv(exportToCsv(exportRows, exportColumns), name)
      else downloadJson(exportToJson(exportRows, exportColumns), name)
    },
    [displayRows, visibleFields, selectedSchema]
  )

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Control row: schema picker, deleted, edit, refresh, copy, count */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hairline">
          <select
            value={selectedSchema ?? ''}
            onChange={(e) => setSelectedSchema(e.target.value || null)}
            className="bg-surface-2 border border-hairline rounded px-2 py-0.5 text-xs text-ink-1 max-w-[200px]"
            title="Filter by schema"
          >
            <option value="">{formatSchemaOptionLabel('All schemas', allCount)}</option>
            {schemaOptions.map((s) => (
              <option key={s.iri} value={s.iri}>
                {formatSchemaOptionLabel(s.label, schemaCounts.get(s.iri))}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[10px] text-ink-3 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="w-3 h-3"
            />
            Deleted
          </label>
          {/* Editing needs a resolved, typed schema. Without one (the All-schemas
              view or an unregistered schema) we can't type cells, so the toggle
              is hidden and a note below explains why. */}
          {selectedSchema && definedSchema && (
            <button
              onClick={() => setEditing(!editing)}
              className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
                editing
                  ? 'border-accent-ink text-ink-1'
                  : 'border-hairline text-ink-3 hover:text-ink-1'
              }`}
              title={
                editing
                  ? 'Editing on — double-click an unlocked cell to edit; locked cells show a lock (hover for why). Changes write to the store and sync.'
                  : 'Enable editing — then double-click a cell to modify it (writes to the store)'
              }
            >
              {editing ? 'editing' : 'edit'}
            </button>
          )}
          <button
            onClick={() => refresh()}
            className="text-[10px] text-ink-2 hover:text-ink-1 px-1"
            title="Re-run query"
          >
            ↻
          </button>
          <CopyButton getData={getCopyData} label="Copy" />
          <button
            onClick={() => handleDownload('csv')}
            className="text-[10px] text-ink-2 hover:text-ink-1 px-1 border border-hairline rounded whitespace-nowrap"
            title="Download the current view as CSV. CSV carries cell values only — relations, history, and comments do not survive; use Settings → Export data for the lossless bundle."
          >
            CSV
          </button>
          <button
            onClick={() => handleDownload('json')}
            className="text-[10px] text-ink-2 hover:text-ink-1 px-1 border border-hairline rounded whitespace-nowrap"
            title="Download the current view as JSON (re-importable as new rows). Materialized values only — history and authorship do not survive; use Settings → Export data for the lossless bundle."
          >
            JSON
          </button>
          <span className="ml-auto text-[10px] text-ink-3 whitespace-nowrap">
            {displayRows.length} shown · {loadedCount} loaded
            {totalCount != null && totalCount !== loadedCount ? ` of ${totalCount}` : ''}
          </span>
        </div>

        {/* Rich toolbar: sort chips · filter builder · density · columns · search.
            GridToolbar opens its popovers downward (top-full) with no internal
            scroll — fine in a tall page, but they'd be clipped in the short
            bottom dock. Cap + scroll them (the popovers carry `z-30`) so they
            stay reachable at any dock size. */}
        <div className="[&_.z-30]:max-h-[220px] [&_.z-30]:overflow-y-auto">
          <GridToolbar
            views={[]}
            fields={fields}
            sorts={sorts}
            onToggleSort={toggleSort}
            onClearSorts={clearSorts}
            filters={filters}
            onChangeFilters={setFilters}
            rowHeight={rowHeight}
            onChangeRowHeight={setRowHeight}
            hiddenFieldIds={hiddenFieldIds}
            onToggleFieldVisible={toggleFieldVisible}
            search={search}
            onSearchChange={setSearch}
            rowCount={displayRows.length}
          />
        </div>

        {editError && (
          <div className="px-3 py-1 border-b border-hairline text-[10px] text-destructive bg-destructive/5">
            Edit failed: {editError}
          </div>
        )}

        {/* Explain why editing isn't available, so a read-only grid never looks
            broken. Order matters: unresolved schema first, then the All-schemas
            hint, then the enforcement note once editing is actually on. */}
        {selectedSchema && schemaStatus === 'unresolved' && (
          <div className="px-3 py-0.5 text-[10px] text-ink-3 border-b border-hairline bg-surface-2/40">
            This schema isn&apos;t in the registry, so its columns can&apos;t be typed — cells are
            read-only here. (Hover a cell for details.)
          </div>
        )}

        {!selectedSchema && nodes.length > 0 && (
          <div className="px-3 py-0.5 text-[10px] text-ink-3 border-b border-hairline bg-surface-2/40">
            Pick a specific schema above to edit its rows — the All-schemas view is read-only.
          </div>
        )}

        {editable && !authzEnabled && (
          <div className="px-3 py-0.5 text-[10px] text-ink-3 border-b border-hairline bg-surface-2/40">
            Editing on — authorization isn&apos;t enforced in this store, so every typed cell is
            editable. Read-only columns show a lock; hover for why.
          </div>
        )}

        {truncated && (
          <div className="px-3 py-0.5 text-[10px] text-ink-3 border-b border-hairline bg-surface-2/40">
            Sorting/filtering the {loadedCount} loaded rows
            {totalCount != null ? ` (of ${totalCount})` : ' (window capped)'}. Pick a schema or
            refine search to load fewer, more relevant rows.
          </div>
        )}

        {/* Query plan inspector */}
        {plan && <PlanInspector plan={plan} />}

        {/* Grid */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full text-ink-3 text-xs">
              Loading nodes...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-xs gap-1 px-4 text-center">
              <span className="text-destructive">Query failed</span>
              <span className="text-ink-3">{error}</span>
            </div>
          ) : displayRows.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ink-3 text-xs">
              {nodes.length === 0 ? 'No nodes found' : 'No rows match the active filters'}
            </div>
          ) : (
            <PanelErrorBoundary label="Data grid">
              <GridSurface
                fields={visibleFields}
                rows={displayRows}
                sorts={sorts}
                onToggleSort={toggleSort}
                readOnly={!editable}
                cellLockReasons={editable ? cellLockReasons : undefined}
                rowHeight={ROW_HEIGHT_PX[rowHeight]}
                onOpenRow={(rowId) => setSelectedNodeId(rowId)}
                onUpdateCell={
                  editable
                    ? (rowId, fieldId, value) =>
                        updateCell(rowId, fieldId, fieldTypeById.get(fieldId) ?? 'text', value)
                    : undefined
                }
                className="text-[11px]"
              />
            </PanelErrorBoundary>
          )}
        </div>
      </div>

      {/* Detail pane */}
      {selectedNode && (
        <div className="w-80 border-l border-hairline overflow-y-auto p-3 shrink-0">
          <NodeDetail node={selectedNode} onClose={() => setSelectedNodeId(null)} />
        </div>
      )}
    </div>
  )
}

function PlanInspector({ plan }: { plan: PlanMeta }) {
  const [showSql, setShowSql] = useState(false)
  const rows = formatPlanRows(plan)
  return (
    <div className="px-3 py-1 border-b border-hairline bg-surface-2/50 flex items-center gap-3 flex-wrap text-[10px]">
      <span className="text-ink-3 font-medium uppercase tracking-wide">Plan</span>
      {rows.map((r) => (
        <span key={r.label} className="text-ink-2">
          <span className="text-ink-3">{r.label}:</span> {r.value}
        </span>
      ))}
      {plan.sql && (
        <button
          onClick={() => setShowSql((v) => !v)}
          className="text-ink-3 hover:text-ink-1 underline decoration-dotted"
        >
          {showSql ? 'hide SQL' : 'SQL'}
        </button>
      )}
      {showSql && plan.sql && (
        <pre className="w-full mt-1 text-[10px] text-ink-2 bg-surface-1 rounded p-1.5 overflow-x-auto">
          {plan.sql}
        </pre>
      )}
    </div>
  )
}

function NodeDetail({ node, onClose }: { node: NodeState; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-ink-1">Node Detail</h3>
        <button onClick={onClose} className="text-ink-3 hover:text-ink-1 text-xs">
          x
        </button>
      </div>
      <div className="space-y-1.5">
        <DetailRow label="ID" value={node.id} mono />
        <DetailRow label="Schema" value={node.schemaId} />
        <DetailRow label="Created" value={new Date(node.createdAt).toLocaleString()} />
        <DetailRow label="Updated" value={new Date(node.updatedAt).toLocaleString()} />
        <DetailRow label="Author" value={truncateDID(node.createdBy)} mono />
        <DetailRow label="Deleted" value={String(node.deleted)} />
      </div>
      <div>
        <h4 className="text-[10px] font-bold text-ink-2 mb-1">Properties</h4>
        <pre className="text-[10px] text-ink-2 bg-surface-2 rounded p-2 overflow-x-auto max-h-60">
          {JSON.stringify(node.properties, null, 2)}
        </pre>
      </div>
      <NodePermissions nodeId={node.id} />
    </div>
  )
}

/** Read + write authorization for a node, with the full derivation (roles,
 *  grants, deny reasons, evaluation steps) — the "how is this derived" view. */
function NodePermissions({ nodeId }: { nodeId: string }) {
  const { store } = useDevTools()
  const authz = store?.auth ?? null
  const [traces, setTraces] = useState<{ read: AuthTrace; write: AuthTrace } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authz) {
      setTraces(null)
      return
    }
    let alive = true
    setError(null)
    // Clear the previous node's traces so we show "Evaluating…" rather than
    // briefly attributing the old node's permissions to the newly selected one.
    setTraces(null)
    Promise.all([
      authz.explain({ action: 'read', nodeId }),
      authz.explain({ action: 'write', nodeId })
    ])
      .then(([read, write]) => {
        if (alive) setTraces({ read, write })
      })
      .catch((e) => {
        if (alive) {
          setError(e instanceof Error ? e.message : String(e))
          setTraces(null)
        }
      })
    return () => {
      alive = false
    }
  }, [authz, nodeId])

  return (
    <div>
      <h4 className="text-[10px] font-bold text-ink-2 mb-1">Permissions</h4>
      {!authz ? (
        <div className="text-[10px] text-ink-3">Authorization is not enforced in this store.</div>
      ) : error ? (
        <div className="text-[10px] text-destructive">{error}</div>
      ) : !traces ? (
        <div className="text-[10px] text-ink-3">Evaluating…</div>
      ) : (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] text-ink-3 mb-0.5">Read</div>
            <AuthTraceView trace={traces.read} />
          </div>
          <div>
            <div className="text-[10px] text-ink-3 mb-0.5">Write</div>
            <AuthTraceView trace={traces.write} />
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-ink-3 w-16 shrink-0">{label}</span>
      <span className={`text-[10px] text-ink-2 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
