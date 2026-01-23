/**
 * NodeExplorer panel - Browse all nodes using @xnet/views TableView
 *
 * Uses the TableView component for virtual scrolling, sorting, filtering,
 * and column management. Synthesizes a Schema from available node data.
 */

import { useMemo, useState } from 'react'
import { TableView, type TableRow } from '@xnet/views'
import type { Schema, PropertyDefinition } from '@xnet/data'
import type { ViewConfig } from '@xnet/views'
import { useNodeExplorer, type NodeEntry } from './useNodeExplorer'
import { truncateDID } from '../../utils/formatters'

export function NodeExplorer() {
  const {
    nodes,
    allNodes,
    schemas,
    selectedNode,
    setSelectedNode,
    schemaFilter,
    setSchemaFilter,
    searchQuery,
    setSearchQuery,
    showDeleted,
    setShowDeleted,
    isLoading
  } = useNodeExplorer()

  const [viewConfig, setViewConfig] = useState<ViewConfig>(() => createDefaultViewConfig(null))

  // When schema filter changes, update view config to show relevant columns
  const schema = useMemo(() => synthesizeSchema(nodes, schemaFilter), [nodes, schemaFilter])

  // Update view config when schema filter changes
  const activeViewConfig = useMemo(() => {
    if (schemaFilter) {
      // Schema-specific: show actual property columns
      const propNames = schema.properties
        .filter((p) => !['createdAt', 'updatedAt', 'createdBy'].includes(p.name))
        .map((p) => p.name)
        .slice(0, 6)
      return {
        ...viewConfig,
        visibleProperties: ['id', ...propNames, 'updatedAt']
      }
    }
    return viewConfig
  }, [schemaFilter, schema, viewConfig])

  // Convert nodes to TableRow format
  const tableRows: TableRow[] = useMemo(() => nodes.map(nodeToTableRow), [nodes])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">Loading nodes...</div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Main table area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          />
          <select
            value={schemaFilter || ''}
            onChange={(e) => setSchemaFilter(e.target.value || null)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200"
          >
            <option value="">All schemas ({schemas.length})</option>
            {schemas.map((s) => (
              <option key={s} value={s}>
                {s.split('/').pop()}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="w-3 h-3"
            />
            Deleted
          </label>
          <span className="text-[10px] text-zinc-500">{nodes.length} nodes</span>
        </div>

        {/* TableView */}
        <div className="flex-1 overflow-hidden">
          {nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
              No nodes found
            </div>
          ) : (
            <TableView
              schema={schema}
              view={activeViewConfig}
              data={tableRows}
              onUpdateView={(changes: Partial<ViewConfig>) =>
                setViewConfig((prev: ViewConfig) => ({ ...prev, ...changes }))
              }
              rowHeight={28}
              overscan={15}
              className="text-[11px]"
            />
          )}
        </div>
      </div>

      {/* Detail pane */}
      {selectedNode && (
        <div className="w-80 border-l border-zinc-800 overflow-y-auto p-3">
          <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
        </div>
      )}
    </div>
  )
}

// ─── Schema Synthesis ──────────────────────────────────────

/**
 * Create a synthesized Schema for the TableView based on current nodes.
 * When filtering by a specific schema, includes its actual property names.
 * Otherwise, shows generic columns.
 */
function synthesizeSchema(nodes: NodeEntry[], schemaFilter: string | null): Schema {
  const baseProperties: PropertyDefinition[] = [
    { '@id': 'devtools:id', name: 'id', type: 'text', required: true },
    { '@id': 'devtools:schemaLabel', name: 'schema', type: 'text', required: true },
    { '@id': 'devtools:updatedAt', name: 'updatedAt', type: 'updated', required: true },
    { '@id': 'devtools:createdAt', name: 'createdAt', type: 'created', required: true },
    { '@id': 'devtools:createdBy', name: 'createdBy', type: 'createdBy', required: true }
  ]

  if (schemaFilter && nodes.length > 0) {
    // Collect unique property keys from nodes of this schema
    const propKeys = new Set<string>()
    for (const node of nodes) {
      Object.keys(node.properties).forEach((k) => propKeys.add(k))
    }

    // Create property definitions for actual schema properties
    const schemaProps: PropertyDefinition[] = Array.from(propKeys)
      .slice(0, 10)
      .map((key) => ({
        '@id': `devtools:prop:${key}`,
        name: key,
        type: 'text' as const,
        required: false
      }))

    return {
      '@id': `xnet://devtools/${schemaFilter.split('/').pop() ?? 'Node'}`,
      '@type': 'xnet://xnet.dev/Schema',
      name: schemaFilter.split('/').pop() ?? 'Node',
      namespace: 'xnet://devtools/',
      properties: [baseProperties[0], ...schemaProps, ...baseProperties.slice(2)]
    }
  }

  // Generic schema for all nodes
  return {
    '@id': 'xnet://devtools/Node',
    '@type': 'xnet://xnet.dev/Schema',
    name: 'Node',
    namespace: 'xnet://devtools/',
    properties: [
      ...baseProperties.slice(0, 2),
      { '@id': 'devtools:preview', name: 'preview', type: 'text', required: false },
      ...baseProperties.slice(2)
    ]
  }
}

/**
 * Convert a NodeEntry to a TableRow for the TableView.
 * Flattens properties to top-level for column access.
 */
function nodeToTableRow(node: NodeEntry): TableRow {
  const row: TableRow = {
    id: node.id,
    schema: node.schemaLabel,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    createdBy: node.createdBy,
    preview: Object.entries(node.properties)
      .slice(0, 3)
      .map(
        ([k, v]) =>
          `${k}: ${typeof v === 'string' ? v.slice(0, 20) : JSON.stringify(v)?.slice(0, 20)}`
      )
      .join(', ')
  }

  // Flatten properties into the row for schema-specific views
  for (const [key, value] of Object.entries(node.properties)) {
    if (!(key in row)) {
      row[key] = typeof value === 'object' ? JSON.stringify(value) : value
    }
  }

  return row
}

function createDefaultViewConfig(schemaFilter: string | null): ViewConfig {
  return {
    id: 'devtools-node-explorer',
    name: 'Node Explorer',
    type: 'table',
    visibleProperties: ['id', 'schema', 'preview', 'updatedAt'],
    propertyWidths: {
      id: 100,
      schema: 100,
      preview: 250,
      updatedAt: 100,
      createdAt: 100,
      createdBy: 120
    },
    sorts: []
  }
}

// ─── Node Detail ───────────────────────────────────────────

function NodeDetail({ node, onClose }: { node: NodeEntry; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-zinc-200">Node Detail</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white text-xs">
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
        <h4 className="text-[10px] font-bold text-zinc-400 mb-1">Properties</h4>
        <pre className="text-[10px] text-zinc-300 bg-zinc-900 rounded p-2 overflow-x-auto max-h-40">
          {JSON.stringify(node.properties, null, 2)}
        </pre>
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-zinc-500 w-16 shrink-0">{label}</span>
      <span className={`text-[10px] text-zinc-300 break-all ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
