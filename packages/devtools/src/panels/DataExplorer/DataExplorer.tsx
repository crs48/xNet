/**
 * Data panel — a queryable, schema-aware browser over every node in the store.
 *
 * Renders node data in the real database grid (GridSurface, read-only) with a
 * schema picker, live search, a storage-pushdown query-plan inspector, and a
 * row detail pane. Live-updates via store.subscribe (no polling).
 */

import type { NodeState } from '@xnetjs/data'
import { GridSurface, type GridField, type GridRowData } from '@xnetjs/views'
import { useMemo, useState, useCallback } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary'
import { truncateDID } from '../../utils/formatters'
import {
  buildGridFields,
  formatPlanRows,
  nodeToGridRow,
  observedPropertyKeys,
  type PlanMeta
} from './grid-adapter'
import { useDataExplorer } from './useDataExplorer'

export function DataExplorer() {
  const {
    schemaOptions,
    selectedSchema,
    setSelectedSchema,
    definedSchema,
    search,
    setSearch,
    includeDeleted,
    setIncludeDeleted,
    nodes,
    totalCount,
    plan,
    error,
    loading,
    refresh,
    selectedNode,
    setSelectedNodeId
  } = useDataExplorer()

  const showSchemaColumn = !selectedSchema
  const fields: GridField[] = useMemo(
    () => buildGridFields(definedSchema, observedPropertyKeys(nodes), showSchemaColumn),
    [definedSchema, nodes, showSchemaColumn]
  )
  const fieldTypeById = useMemo(() => new Map(fields.map((f) => [f.id, f.type])), [fields])
  const rows: GridRowData[] = useMemo(
    () => nodes.map((n) => nodeToGridRow(n, fieldTypeById)),
    [nodes, fieldTypeById]
  )
  const getNodesData = useCallback(() => nodes, [nodes])

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hairline">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search loaded rows..."
            className="flex-1 bg-surface-2 border border-hairline rounded px-2 py-0.5 text-xs text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-ring"
          />
          <select
            value={selectedSchema ?? ''}
            onChange={(e) => setSelectedSchema(e.target.value || null)}
            className="bg-surface-2 border border-hairline rounded px-2 py-0.5 text-xs text-ink-1 max-w-[180px]"
            title="Filter by schema"
          >
            <option value="">All schemas ({schemaOptions.length})</option>
            {schemaOptions.map((s) => (
              <option key={s.iri} value={s.iri}>
                {s.label}
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
          <span className="text-[10px] text-ink-3 whitespace-nowrap">
            {nodes.length}
            {totalCount != null && totalCount !== nodes.length ? ` / ${totalCount}` : ''} rows
          </span>
          <button
            onClick={() => refresh()}
            className="text-[10px] text-ink-2 hover:text-ink-1 px-1"
            title="Re-run query"
          >
            ↻
          </button>
          <CopyButton getData={getNodesData} label="Copy" />
        </div>

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
          ) : nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ink-3 text-xs">
              No nodes found
            </div>
          ) : (
            <PanelErrorBoundary label="Data grid">
              <GridSurface
                fields={fields}
                rows={rows}
                readOnly
                rowHeight={32}
                onOpenRow={(rowId) => setSelectedNodeId(rowId)}
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
